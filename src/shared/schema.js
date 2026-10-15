import { z } from 'zod';

const NAME = /^[A-Za-z][0-9A-Za-z]*$/;
const FILE = /^[0-9a-z][-0-9a-z]*\.json$/;
const DIR = /^[-0-9A-Za-z_]+(\/[-0-9A-Za-z_]+)*$/;

// ---- Validating the config file itself. ------------------------------------

// A field definition. z.lazy() is needed because the definition refers to itself:
// a collection field contains more fields, which may be collections too.
const fieldConfig = z.lazy(() =>
    z.object({
        name: z.string().regex(NAME),
        label: z.string().optional(),
        type: z.enum(['text', 'longtext', 'image', 'url', 'email', 'collection']),
        required: z.boolean().optional(),
        help: z.string().optional(),
        placeholder: z.string().optional(),
        itemFields: z.array(fieldConfig).optional(),
        itemLabel: z.string().optional()
    })
    .refine((f) => f.type !== 'collection' || (f.itemFields?.length ?? 0) > 0, {
        message: 'A collection needs itemFields'
    })
);

// Rules for the whole config file.
export const configSchema = z
    .object({
        $schema: z.string().optional(),
        site: z.object({ name: z.string(), url: z.string().optional() }),
        contentDir: z.string().regex(DIR),
        imageDir: z.string().regex(DIR),
        sections: z
            .array(
                z.object({
                    name: z.string().regex(NAME),
                    label: z.string().optional(),
                    description: z.string().optional(),
                    file: z.string().regex(FILE),
                    fields: z.array(fieldConfig).min(1)
                })
            ).min(1)
    })
    // Images must live inside the content folder so their paths can be stored
    // relative to it.
    .refine((c) => c.imageDir.startsWith(c.contentDir + '/'), {
        message: 'imageDir must be inside contentDir'
    });

// Checks a parsed imprenta.config.json and returns it. Throws if it's malformed.
export function parseConfig(raw) {
    return configSchema.parse(raw);
}

// ---- Small helpers. --------------------------------------------------------

// The text shown for a field or section in the editor: its `label` if it
// has one, otherwise its name made readable ("socialLinks" → "Social links").
export function labelFor(item) {
    if (item.label) return item.label;
    const words = item.name.replace(/([0-9a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
}

// Image values are stored relative to the content folder, e.g. "images/retrato.webp".
// This returns that leading part ("images/") for the given config.
export function imagePrefix(config) {
    return config.imageDir.slice(config.contentDir.length + 1) + '/';
}

// The error messages the editor shows.
export const MESSAGES = {
    required: 'Este campo es obligatorio.',
    url: 'Escribe un enlace completo, que empiece por https://',
    email: 'Escribe una dirección de correo electrónico válida.',
    image: 'Elige una imagen.',
}

const URL_RE = /^https?:\/\/[^\s#$./?][^\s]*$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


// Checks one plain (non-collection) value against its field's rules.
// Returns the error message to show, or null when the value is fine.
export function checkValue(field, value, prefix) {
    if (field.type === 'collection') return null;
    const v = typeof value === 'string' ? value.trim() : '';
    if (!v) {
        if (!field.required) return null;
        return field.type === 'image' ? MESSAGES.image : MESSAGES.required;
    }
    if (field.type === 'url' && !URL_RE.test(v)) return MESSAGES.url;
    if (field.type === 'email' && !EMAIL_RE.test(v)) return MESSAGES.email;
    if (field.type === 'image' && !isImagePath(v, prefix)) return MESSAGES.image;
    return null;
}

// True for a safe image path: the prefix ("images/") followed by a simple file
// name with an image extension. This blocks tricks like "images/../../package.json",
// which matters because the CMS reads and deletes files in the repo using these paths.
export function isImagePath(value, prefix) {
    return (
        value.startsWith(prefix) &&
        /^[0-9a-z][-.0-9a-z_]*\.(jpe?g|png|webp|avif|gif)$/i.test(value.slice(prefix.length))
    );
}

// ---- Validating content. ---------------------------------------------------

// Builds the Zod rule for one field. Collections become arrays of objects.
function fieldSchema(field, prefix) {
    if (field.type === 'collection') {
        const item = z.object(
            Object.fromEntries(field.itemFields.map((f) => [f.name, fieldSchema(f, prefix)]))
        );
        return z.array(item).default([]);
    }

    return z
        .string()
        .default('')
        .transform((s) => s.trim())
        .superRefine((value, ctx) => {
            const error = checkValue(field, value, prefix);
            if (error) ctx.addIssue({ code: 'custom', message: error })
        });
}

// The Zod schema for one section's JSON file.
export function sectionSchema(section, config) {
    const prefix = imagePrefix(config);
    return z.object(Object.fromEntries(section.fields.map((f) => [f.name, fieldSchema(f, prefix)])));
}

// An empty value for a field: [] for collections, '' for everything else.
export function emptyValue(field) {
    return field.type === 'collection' ? [] : '';
}

// A blank collection item, used when the user presses "Añadir…".
export function emptyItem(fields) {
    return Object.fromEntries(fields.map((f) => [f.name, emptyValue(f)]));
}

// Collects every image path used anywhere in a section's content, including
// inside nested collections. Publishing compares the set before and after a
// change to know which images are no longer used and can be deleted.
export function collectImages(fields, value, out = new Set()) {
    if (!value || typeof value !== 'object') return out;
    for (const field of fields) {
        const v = value[field.name];
        if (field.type === 'image' && typeof v === 'string' && v) out.add(v);
        if (field.type === 'collection' && Array.isArray(v)) {
            for (const item of v) collectImages(field.itemFields, item, out);
        }
    }
    return out;
}
