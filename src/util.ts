// Fast, low-level functions for parsing and formatting GFF3.
// JavaScript port of Robert Buels's Bio::GFF3::LowLevel Perl module.

/**
 * Unescape a string value used in a GFF3 attribute.
 *
 * @param stringVal - Escaped GFF3 string value
 * @returns An unescaped string value
 */
export function unescape(stringVal: string): string {
  return stringVal.replaceAll(/%([0-9A-Fa-f]{2})/g, (_match, seq) =>
    String.fromCharCode(parseInt(seq, 16)),
  )
}

function _escape(regex: RegExp, s: string | number) {
  return String(s).replace(regex, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
    return `%${hex}`
  })
}

/**
 * Escape a value for use in a GFF3 attribute value.
 *
 * @param rawVal - Raw GFF3 attribute value
 * @returns An escaped string value
 */
export function escape(rawVal: string | number): string {
  return _escape(/[\n;\r\t=%&,\u0000-\u001f\u007f-\u00ff]/g, rawVal)
}

/**
 * Escape a value for use in a GFF3 column value.
 *
 * @param rawVal - Raw GFF3 column value
 * @returns An escaped column value
 */
export function escapeColumn(rawVal: string | number): string {
  return _escape(/[\n\r\t%\u0000-\u001f\u007f-\u00ff]/g, rawVal)
}

/**
 * Parse the 9th column (attributes) of a GFF3 feature line.
 *
 * @param attrString - String of GFF3 9th column
 * @returns Parsed attributes
 */
export function parseAttributes(attrString: string): GFF3Attributes {
  if (!attrString?.length || attrString === '.') {
    return {}
  }

  const attrs: GFF3Attributes = {}

  attrString
    .replace(/\r?\n$/, '')
    .split(';')
    .forEach((a) => {
      const nv = a.split('=', 2)
      if (!nv[1]?.length) {
        return
      }

      nv[0] = nv[0].trim()
      let arec = attrs[nv[0].trim()]
      if (!arec) {
        arec = []
        attrs[nv[0]] = arec
      }

      arec.push(
        ...nv[1]
          .split(',')
          .map((s) => s.trim())
          .map(unescape),
      )
    })
  return attrs
}

/**
 * Parse a GFF3 feature line
 *
 * @param line - GFF3 feature line
 * @returns The parsed feature
 */
export function parseFeature(line: string): GFF3FeatureLine {
  // split the line into columns and replace '.' with null in each column
  const f = line.split('\t').map((a) => (a === '.' || a === '' ? null : a))

  // unescape only the ref, source, and type columns
  const parsed: GFF3FeatureLine = {
    seq_id: f[0] && unescape(f[0]),
    source: f[1] && unescape(f[1]),
    type: f[2] && unescape(f[2]),
    start: f[3] === null ? null : parseInt(f[3], 10),
    end: f[4] === null ? null : parseInt(f[4], 10),
    score: f[5] === null ? null : parseFloat(f[5]),
    strand: f[6],
    phase: f[7],
    attributes: f[8] === null ? null : parseAttributes(f[8]),
  }
  return parsed
}

/**
 * Parse a GFF3 directive line.
 *
 * @param line - GFF3 directive line
 * @returns The parsed directive
 */
export function parseDirective(
  line: string,
):
  | GFF3Directive
  | GFF3SequenceRegionDirective
  | GFF3GenomeBuildDirective
  | null {
  const match = /^\s*##\s*(\S+)\s*(.*)/.exec(line)
  if (!match) {
    return null
  }

  const [, name] = match
  let [, , contents] = match

  const parsed: GFF3Directive = { directive: name }
  if (contents.length) {
    contents = contents.replace(/\r?\n$/, '')
    parsed.value = contents
  }

  // do a little additional parsing for sequence-region and genome-build directives
  if (name === 'sequence-region') {
    const c = contents.split(/\s+/, 3)
    return {
      ...parsed,
      seq_id: c[0],
      start: c[1]?.replaceAll(/\D/g, ''),
      end: c[2]?.replaceAll(/\D/g, ''),
    } as GFF3SequenceRegionDirective
  } else if (name === 'genome-build') {
    const [source, buildName] = contents.split(/\s+/, 2)
    return {
      ...parsed,
      source,
      buildName,
    } as GFF3GenomeBuildDirective
  }

  return parsed
}

/**
 * Format an attributes object into a string suitable for the 9th column of GFF3.
 *
 * @param attrs - Attributes
 * @returns GFF3 9th column string
 */
export function formatAttributes(attrs: GFF3Attributes): string {
  const attrOrder: string[] = []
  Object.entries(attrs).forEach(([tag, val]) => {
    if (!val) {
      return
    }
    let valstring
    if (val.hasOwnProperty('toString')) {
      valstring = escape(val.toString())
      // } else if (Array.isArray(val.values)) {
      //   valstring = val.values.map(escape).join(',')
    } else if (Array.isArray(val)) {
      valstring = val.map(escape).join(',')
    } else {
      valstring = escape(val)
    }
    attrOrder.push(`${escape(tag)}=${valstring}`)
  })
  return attrOrder.length ? attrOrder.join(';') : '.'
}

function _formatSingleFeature(
  f: GFF3FeatureLine | GFF3FeatureLineWithRefs,
  seenFeature: Record<string, boolean | undefined>,
) {
  const attrString =
    f.attributes === null || f.attributes === undefined
      ? '.'
      : formatAttributes(f.attributes)

  const fields = [
    f.seq_id === null ? '.' : escapeColumn(f.seq_id),
    f.source === null ? '.' : escapeColumn(f.source),
    f.type === null ? '.' : escapeColumn(f.type),
    f.start === null ? '.' : escapeColumn(f.start),
    f.end === null ? '.' : escapeColumn(f.end),
    f.score === null ? '.' : escapeColumn(f.score),
    f.strand === null ? '.' : escapeColumn(f.strand),
    f.phase === null ? '.' : escapeColumn(f.phase),
    attrString,
  ]

  const formattedString = `${fields.join('\t')}\n`

  // if we have already output this exact feature, skip it
  if (seenFeature[formattedString]) {
    return ''
  }

  seenFeature[formattedString] = true
  return formattedString
}

function _formatFeature(
  feature:
    | GFF3FeatureLine
    | GFF3FeatureLineWithRefs
    | (GFF3FeatureLine | GFF3FeatureLineWithRefs)[],
  seenFeature: Record<string, boolean | undefined>,
): string {
  if (Array.isArray(feature)) {
    return feature.map((f) => _formatFeature(f, seenFeature)).join('')
  }

  const strings = [_formatSingleFeature(feature, seenFeature)]
  if (_isFeatureLineWithRefs(feature)) {
    strings.push(
      ...feature.child_features.map((f) => _formatFeature(f, seenFeature)),
      ...feature.derived_features.map((f) => _formatFeature(f, seenFeature)),
    )
  }
  return strings.join('')
}

/**
 * Format a feature object or array of feature objects into one or more lines of
 * GFF3.
 *
 * @param featureOrFeatures - A feature object or array of feature objects
 * @returns A string of one or more GFF3 lines
 */
export function formatFeature(
  featureOrFeatures:
    | GFF3FeatureLine
    | GFF3FeatureLineWithRefs
    | (GFF3FeatureLine | GFF3FeatureLineWithRefs)[],
): string {
  const seen = {}
  return _formatFeature(featureOrFeatures, seen)
}

/**
 * Format a directive into a line of GFF3.
 *
 * @param directive - A directive object
 * @returns A directive line string
 */
export function formatDirective(directive: GFF3Directive): string {
  let str = `##${directive.directive}`
  if (directive.value) {
    str += ` ${directive.value}`
  }
  str += '\n'
  return str
}

/**
 * Format a comment into a GFF3 comment.
 * Yes I know this is just adding a # and a newline.
 *
 * @param comment - A comment object
 * @returns A comment line string
 */
export function formatComment(comment: GFF3Comment): string {
  return `# ${comment.comment}\n`
}

/**
 * Format a sequence object as FASTA
 *
 * @param seq - A sequence object
 * @returns Formatted single FASTA sequence string
 */
export function formatSequence(seq: GFF3Sequence): string {
  return `>${seq.id}${seq.description ? ` ${seq.description}` : ''}\n${
    seq.sequence
  }\n`
}

/**
 * Format a directive, comment, sequence, or feature, or array of such items,
 * into one or more lines of GFF3.
 *
 * @param itemOrItems - A comment, sequence, or feature, or array of such items
 * @returns A formatted string or array of strings
 */
export function formatItem(
  itemOrItems:
    | GFF3FeatureLineWithRefs
    | GFF3Directive
    | GFF3Comment
    | GFF3Sequence
    | (GFF3FeatureLineWithRefs | GFF3Directive | GFF3Comment | GFF3Sequence)[],
): string | string[] {
  function formatSingleItem(
    item: GFF3FeatureLineWithRefs | GFF3Directive | GFF3Comment | GFF3Sequence,
  ) {
    if ('attributes' in item) {
      return formatFeature(item)
    }
    if ('directive' in item) {
      return formatDirective(item)
    }
    if ('sequence' in item) {
      return formatSequence(item)
    }
    if ('comment' in item) {
      return formatComment(item)
    }
    return '# (invalid item found during format)\n'
  }

  if (Array.isArray(itemOrItems)) {
    return itemOrItems.map(formatSingleItem)
  }
  return formatSingleItem(itemOrItems)
}

/** A record of GFF3 attribute identifiers and the values of those identifiers */
export type GFF3Attributes = Record<string, string[] | undefined>

/** A representation of a single line of a GFF3 file */
export interface GFF3FeatureLine {
  /** The ID of the landmark used to establish the coordinate system for the current feature */
  seq_id: string | null
  /** A free text qualifier intended to describe the algorithm or operating procedure that generated this feature */
  source: string | null
  /** The type of the feature */
  type: string | null
  /** The start coordinates of the feature */
  start: number | null
  /** The end coordinates of the feature */
  end: number | null
  /** The score of the feature */
  score: number | null
  /** The strand of the feature */
  strand: string | null
  /** For features of type "CDS", the phase indicates where the next codon begins relative to the 5' end of the current CDS feature */
  phase: string | null
  /** Feature attributes */
  attributes: GFF3Attributes | null
}

/**
 * A GFF3 Feature line that includes references to other features defined in
 * their "Parent" or "Derives_from" attributes
 */
export interface GFF3FeatureLineWithRefs extends GFF3FeatureLine {
  /** An array of child features */
  child_features: GFF3Feature[]
  /** An array of features derived from this feature */
  derived_features: GFF3Feature[]
}

function _isFeatureLineWithRefs(
  featureLine: GFF3FeatureLine | GFF3FeatureLineWithRefs,
): featureLine is GFF3FeatureLineWithRefs {
  return (
    (featureLine as GFF3FeatureLineWithRefs).child_features !== undefined &&
    (featureLine as GFF3FeatureLineWithRefs).derived_features !== undefined
  )
}

/**
 * A GFF3 feature, which may include multiple individual feature lines
 */
export type GFF3Feature = GFF3FeatureLineWithRefs[]

/** A GFF3 directive */
export interface GFF3Directive {
  /** The name of the directive */
  directive: string
  /** The string value of the directive */
  value?: string
}

/** A GFF3 sequence-region directive */
export interface GFF3SequenceRegionDirective extends GFF3Directive {
  /** The string value of the directive */
  value: string
  /** The sequence ID parsed from the directive */
  seq_id: string
  /** The sequence start parsed from the directive */
  start: string
  /** The sequence end parsed from the directive */
  end: string
}

/** A GFF3 genome-build directive */
export interface GFF3GenomeBuildDirective extends GFF3Directive {
  /** The string value of the directive */
  value: string
  /** The genome build source parsed from the directive */
  source: string
  /** The genome build name parsed from the directive */
  buildName: string
}

/** A GFF3 comment */
export interface GFF3Comment {
  /** The text of the comment */
  comment: string
}

/** A GFF3 FASTA single sequence */
export interface GFF3Sequence {
  /** The ID of the sequence */
  id: string
  /** The description of the sequence */
  description?: string
  /** The sequence */
  sequence: string
}

export type GFF3Item = GFF3Feature | GFF3Directive | GFF3Comment | GFF3Sequence
