import Parser, { ParseCallbacks } from './parse'
import {
  formatItem,
  formatSequence,
  GFF3Comment,
  GFF3Directive,
  GFF3Feature,
  GFF3Sequence,
  GFF3Item,
} from './util'

/** Parser options */
export interface ParseOptions {
  /** Whether to resolve references to derives from features */
  disableDerivesFromReferences?: boolean
  /** Whether to parse features, default true */
  parseFeatures?: boolean
  /** Whether to parse directives, default false */
  parseDirectives?: boolean
  /** Whether to parse comments, default false */
  parseComments?: boolean
  /** Whether to parse sequences, default true */
  parseSequences?: boolean
  /** Maximum number of GFF3 lines to buffer, default 1000 */
  bufferSize?: number
}

type ParseOptionsProcessed = Required<ParseOptions>

// shared arg processing for the parse routines
function _processParseOptions(options: ParseOptions): ParseOptionsProcessed {
  const out = {
    parseFeatures: true,
    parseDirectives: false,
    parseSequences: true,
    parseComments: false,
    bufferSize: 1000,
    disableDerivesFromReferences: false,
    ...options,
  }

  return out
}

/**
 * Parse a stream of text data into a stream of feature, directive, comment,
 * an sequence objects.
 */
export class GFFTransformer implements Transformer<Uint8Array, GFF3Item> {
  private decoder: TextDecoder
  private parser: Parser
  private lastString = ''
  private parseFeatures: boolean
  private parseDirectives: boolean
  private parseComments: boolean
  private parseSequences: boolean

  /**
   * Options for how the text stream is parsed
   * @param options - Parser options
   */
  constructor(options: ParseOptions = {}) {
    this.decoder = new TextDecoder()
    const processedOptions = _processParseOptions(options)
    const { bufferSize, disableDerivesFromReferences } = processedOptions
    this.parser = new Parser({ bufferSize, disableDerivesFromReferences })
    this.parseFeatures = processedOptions.parseFeatures
    this.parseDirectives = processedOptions.parseDirectives
    this.parseComments = processedOptions.parseComments
    this.parseSequences = processedOptions.parseSequences
  }

  private makeCallbacks(
    controller: TransformStreamDefaultController<GFF3Item>,
  ) {
    const callbacks: ParseCallbacks = {
      errorCallback: this.emitErrorMessage.bind(this, controller),
    }
    if (this.parseFeatures) {
      callbacks.featureCallback = this.enqueueItem.bind(this, controller)
    }
    if (this.parseDirectives) {
      callbacks.directiveCallback = this.enqueueItem.bind(this, controller)
    }
    if (this.parseComments) {
      callbacks.commentCallback = this.enqueueItem.bind(this, controller)
    }
    if (this.parseSequences) {
      callbacks.sequenceCallback = this.enqueueItem.bind(this, controller)
    }
    return callbacks
  }

  private emitErrorMessage(
    controller: TransformStreamDefaultController<GFF3Item>,
    errorMessage: string,
  ) {
    controller.error(errorMessage)
  }
  private enqueueItem(
    controller: TransformStreamDefaultController<GFF3Item>,
    item: GFF3Item,
  ) {
    controller.enqueue(item)
  }

  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<GFF3Item>,
  ) {
    // Decode the current chunk to string and prepend the last string
    const string = `${this.lastString}${this.decoder.decode(chunk, {
      stream: true,
    })}`
    // Extract lines from chunk
    const lines = string.split(/\r\n|[\r\n]/g)
    // Save last line, as it might be incomplete
    this.lastString = lines.pop() || ''
    // Enqueue each line in the next chunk
    for (const line of lines) {
      this.parser.addLine(line, this.makeCallbacks(controller))
    }
  }

  flush(controller: TransformStreamDefaultController<GFF3Item>) {
    const callbacks = this.makeCallbacks(controller)
    this.lastString = `${this.lastString}${this.decoder.decode()}`
    if (this.lastString) {
      this.parser.addLine(this.lastString, callbacks)
      this.lastString = ''
    }
    this.parser.finish(callbacks)
  }
}

/**
 * Parse a stream of text data into a stream of feature, directive, comment,
 * an sequence objects.
 *
 * @param options - Parsing options
 * @returns stream (in objectMode) of parsed items
 */
export function parseStream(options: ParseOptions = {}): GFFTransformer {
  return new GFFTransformer(options)
}

/**
 * Synchronously parse a string containing GFF3 and return an array of the
 * parsed items.
 *
 * @param str - GFF3 string
 * @param inputOptions - Parsing options
 * @returns array of parsed features, directives, comments and/or sequences
 */
export function parseStringSync(
  str: string,
  inputOptions?:
    | {
        disableDerivesFromReferences?: boolean
        bufferSize?: number
      }
    | undefined,
): (GFF3Feature | GFF3Sequence)[]
export function parseStringSync<F extends boolean>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseFeatures: F
    bufferSize?: number
  },
): F extends true ? (GFF3Feature | GFF3Sequence)[] : GFF3Sequence[]
export function parseStringSync<D extends boolean>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseDirectives: D
    bufferSize?: number
  },
): D extends true
  ? (GFF3Feature | GFF3Directive | GFF3Sequence)[]
  : (GFF3Feature | GFF3Sequence)[]
export function parseStringSync<C extends boolean>(
  str: string,
  inputOptions: {
    parseComments: C
    bufferSize?: number
  },
): C extends true
  ? (GFF3Feature | GFF3Comment | GFF3Sequence)[]
  : (GFF3Feature | GFF3Sequence)[]
export function parseStringSync<S extends boolean>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseSequences: S
    bufferSize?: number
  },
): S extends true ? (GFF3Feature | GFF3Sequence)[] : GFF3Feature[]
export function parseStringSync<F extends boolean, D extends boolean>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseFeatures: F
    parseDirectives: D
    bufferSize?: number
  },
): F extends true
  ? D extends true
    ? (GFF3Feature | GFF3Directive | GFF3Sequence)[]
    : (GFF3Feature | GFF3Sequence)[]
  : D extends true
    ? (GFF3Directive | GFF3Sequence)[]
    : GFF3Sequence[]
export function parseStringSync<F extends boolean, C extends boolean>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseFeatures: F
    parseComments: C
    bufferSize?: number
  },
): F extends true
  ? C extends true
    ? (GFF3Feature | GFF3Comment | GFF3Sequence)[]
    : (GFF3Feature | GFF3Sequence)[]
  : C extends true
    ? (GFF3Comment | GFF3Sequence)[]
    : GFF3Sequence[]
export function parseStringSync<F extends boolean, S extends boolean>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseFeatures: F
    parseSequences: S
    bufferSize?: number
  },
): F extends true
  ? S extends true
    ? (GFF3Feature | GFF3Sequence)[]
    : GFF3Feature[]
  : S extends true
    ? GFF3Sequence[]
    : []
export function parseStringSync<D extends boolean, C extends boolean>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseDirectives: D
    parseComments: C
    bufferSize?: number
  },
): D extends true
  ? C extends true
    ? (GFF3Feature | GFF3Directive | GFF3Comment | GFF3Sequence)[]
    : (GFF3Feature | GFF3Directive | GFF3Sequence)[]
  : C extends true
    ? (GFF3Feature | GFF3Comment | GFF3Sequence)[]
    : (GFF3Feature | GFF3Sequence)[]
export function parseStringSync<D extends boolean, S extends boolean>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseDirectives: D
    parseSequences: S
    bufferSize?: number
  },
): D extends true
  ? S extends true
    ? (GFF3Feature | GFF3Directive | GFF3Sequence)[]
    : (GFF3Feature | GFF3Directive)[]
  : S extends true
    ? (GFF3Feature | GFF3Sequence)[]
    : GFF3Feature[]
export function parseStringSync<C extends boolean, S extends boolean>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseComments: C
    parseSequences: S
    bufferSize?: number
  },
): C extends true
  ? S extends true
    ? (GFF3Feature | GFF3Comment | GFF3Sequence)[]
    : (GFF3Feature | GFF3Comment)[]
  : S extends true
    ? (GFF3Feature | GFF3Sequence)[]
    : GFF3Feature[]
export function parseStringSync<
  F extends boolean,
  D extends boolean,
  C extends boolean,
>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseFeatures: F
    parseDirectives: D
    parseComments: C
    bufferSize?: number
  },
): F extends true
  ? D extends true
    ? C extends true
      ? GFF3Item[]
      : (GFF3Feature | GFF3Directive | GFF3Sequence)[]
    : C extends true
      ? (GFF3Feature | GFF3Comment | GFF3Sequence)[]
      : (GFF3Feature | GFF3Sequence)[]
  : D extends true
    ? C extends true
      ? (GFF3Directive | GFF3Comment | GFF3Sequence)[]
      : (GFF3Directive | GFF3Sequence)[]
    : C extends true
      ? (GFF3Comment | GFF3Sequence)[]
      : GFF3Sequence[]
export function parseStringSync<
  F extends boolean,
  D extends boolean,
  S extends boolean,
>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseFeatures: F
    parseDirectives: D
    parseSequences: S
    bufferSize?: number
  },
): F extends true
  ? D extends true
    ? S extends true
      ? (GFF3Feature | GFF3Directive | GFF3Sequence)[]
      : (GFF3Feature | GFF3Directive)[]
    : S extends true
      ? (GFF3Feature | GFF3Sequence)[]
      : GFF3Feature[]
  : D extends true
    ? S extends true
      ? (GFF3Directive | GFF3Sequence)[]
      : GFF3Directive[]
    : S extends true
      ? GFF3Sequence[]
      : []
export function parseStringSync<
  F extends boolean,
  C extends boolean,
  S extends boolean,
>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseFeatures: F
    parseComments: C
    parseSequences: S
    bufferSize?: number
  },
): F extends true
  ? C extends true
    ? S extends true
      ? (GFF3Feature | GFF3Comment | GFF3Sequence)[]
      : (GFF3Feature | GFF3Comment)[]
    : S extends true
      ? (GFF3Feature | GFF3Sequence)[]
      : GFF3Feature[]
  : C extends true
    ? S extends true
      ? (GFF3Comment | GFF3Sequence)[]
      : GFF3Comment[]
    : S extends true
      ? GFF3Sequence[]
      : []
export function parseStringSync<
  D extends boolean,
  C extends boolean,
  S extends boolean,
>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseFeatures: D
    parseComments: C
    parseSequences: S
    bufferSize?: number
  },
): D extends true
  ? C extends true
    ? S extends true
      ? GFF3Item[]
      : (GFF3Feature | GFF3Directive | GFF3Comment)[]
    : S extends true
      ? (GFF3Feature | GFF3Directive | GFF3Sequence)[]
      : (GFF3Feature | GFF3Directive)[]
  : C extends true
    ? S extends true
      ? (GFF3Feature | GFF3Comment | GFF3Sequence)[]
      : (GFF3Feature | GFF3Comment)[]
    : S extends true
      ? (GFF3Feature | GFF3Sequence)[]
      : GFF3Feature[]
export function parseStringSync<
  F extends boolean,
  D extends boolean,
  C extends boolean,
  S extends boolean,
>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseFeatures: F
    parseDirectives: D
    parseComments: C
    parseSequences: S
    bufferSize?: number
  },
): F extends true
  ? D extends true
    ? C extends true
      ? S extends true
        ? GFF3Item[]
        : (GFF3Feature | GFF3Directive | GFF3Comment)[]
      : S extends true
        ? (GFF3Feature | GFF3Directive | GFF3Sequence)[]
        : (GFF3Feature | GFF3Directive)[]
    : C extends true
      ? S extends true
        ? (GFF3Feature | GFF3Comment | GFF3Sequence)[]
        : (GFF3Feature | GFF3Comment)[]
      : S extends true
        ? (GFF3Feature | GFF3Sequence)[]
        : GFF3Feature[]
  : D extends true
    ? C extends true
      ? S extends true
        ? (GFF3Directive | GFF3Comment | GFF3Sequence)[]
        : (GFF3Directive | GFF3Comment)[]
      : S extends true
        ? (GFF3Directive | GFF3Sequence)[]
        : GFF3Directive[]
    : C extends true
      ? S extends true
        ? (GFF3Comment | GFF3Sequence)[]
        : GFF3Comment[]
      : S extends true
        ? GFF3Sequence[]
        : []
export function parseStringSync(
  str: string,
  inputOptions: ParseOptions = {},
): GFF3Item[] {
  if (!str) {
    return []
  }

  const options = _processParseOptions(inputOptions)

  const items: GFF3Item[] = []
  const push = items.push.bind(items)

  const callbacks: ParseCallbacks = {
    errorCallback: (err: string) => {
      throw new Error(err)
    },
  }
  if (options.parseFeatures) {
    callbacks.featureCallback = push
  }
  if (options.parseDirectives) {
    callbacks.directiveCallback = push
  }
  if (options.parseComments) {
    callbacks.commentCallback = push
  }
  if (options.parseSequences) {
    callbacks.sequenceCallback = push
  }

  const parser = new Parser({
    disableDerivesFromReferences: options.disableDerivesFromReferences || false,
    bufferSize: Infinity,
  })

  str
    .split(/\r\n|[\r\n]/)
    .forEach((line) => parser.addLine.bind(parser)(line, callbacks))
  parser.finish(callbacks)

  return items
}

/**
 * Format an array of GFF3 items (features,directives,comments) into string of
 * GFF3. Does not insert synchronization (###) marks.
 *
 * @param items - Array of features, directives, comments and/or sequences
 * @returns the formatted GFF3
 */
export function formatSync(items: GFF3Item[]): string {
  // sort items into seq and other
  const other: (GFF3Feature | GFF3Directive | GFF3Comment)[] = []
  const sequences: GFF3Sequence[] = []
  items.forEach((i) => {
    if ('sequence' in i) {
      sequences.push(i)
    } else {
      other.push(i)
    }
  })
  let str = other
    .map((o) => (Array.isArray(o) ? formatItem(o).join('') : formatItem(o)))
    .join('')
  if (sequences.length) {
    str += '##FASTA\n'
    str += sequences.map(formatSequence).join('')
  }
  return str
}

/** Formatter options */
export interface FormatOptions {
  /**
   * The minimum number of lines to emit between sync (###) directives, default
   * 100
   */
  minSyncLines?: number
  /**
   * Whether to insert a version directive at the beginning of a formatted
   * stream if one does not exist already, default true
   */
  insertVersionDirective?: boolean
}

/**
 * Transform a stream of features, directives, comments and/or sequences into a
 * stream of GFF3 text.
 *
 * Inserts synchronization (###) marks automatically.
 */
export class GFFFormattingTransformer implements Transformer<GFF3Item, string> {
  linesSinceLastSyncMark = 0
  haveWeEmittedData = false
  fastaMode = false
  minLinesBetweenSyncMarks: number
  insertVersionDirective: boolean
  /**
   * Options for how the output text stream is formatted
   * @param options - Formatter options
   */
  constructor(options: FormatOptions = {}) {
    this.minLinesBetweenSyncMarks = options.minSyncLines || 100
    this.insertVersionDirective = options.insertVersionDirective || true
  }

  transform(
    chunk: GFF3Item,
    controller: TransformStreamDefaultController<string>,
  ) {
    // if we have not emitted anything yet, and this first chunk is not a
    // gff-version directive, emit one
    if (
      !this.haveWeEmittedData &&
      this.insertVersionDirective &&
      (!('directive' in chunk) ||
        ('directive' in chunk && chunk.directive !== 'gff-version'))
    ) {
      controller.enqueue('##gff-version 3\n')
    }

    // if it's a sequence chunk coming down, emit a FASTA directive and change
    // to FASTA mode
    if ('sequence' in chunk && !this.fastaMode) {
      controller.enqueue('##FASTA\n')
      this.fastaMode = true
    }

    const str = Array.isArray(chunk)
      ? chunk.map((c) => formatItem(c)).join('')
      : formatItem(chunk)

    controller.enqueue(str)

    if (this.linesSinceLastSyncMark >= this.minLinesBetweenSyncMarks) {
      controller.enqueue('###\n')
      this.linesSinceLastSyncMark = 0
    } else {
      // count the number of newlines in this chunk
      let count = 0
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < str.length; i += 1) {
        if (str[i] === '\n') {
          count += 1
        }
      }
      this.linesSinceLastSyncMark += count
    }

    this.haveWeEmittedData = true
  }
}

/**
 * Format a stream of features, directives, comments and/or sequences into a
 * stream of GFF3 text.
 *
 * Inserts synchronization (###) marks automatically.
 *
 * @param options - parser options
 */
export function formatStream(
  options: FormatOptions = {},
): GFFFormattingTransformer {
  return new GFFFormattingTransformer(options)
}

export {
  type GFF3FeatureLine,
  type GFF3Comment,
  type GFF3FeatureLineWithRefs,
  type GFF3Directive,
  type GFF3Sequence,
  type GFF3Feature,
  type GFF3Item,
} from './util'
