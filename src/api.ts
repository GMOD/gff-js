import { GFF3Parser, ParseCallbacks } from './parse'
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
  /** Maximum number of GFF3 lines to buffer, default Infinity */
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
    bufferSize: Infinity,
    disableDerivesFromReferences: false,
    ...options,
  }

  return out
}

/**
 * Parse a stream of text data into a stream of feature, directive, comment,
 * an sequence objects.
 */
export class GFFTransformer<
  O extends ParseOptions,
  T = O extends { parseFeatures: true }
    ? O extends { parseSequences: true }
      ? O extends { parseDirectives: true }
        ? O extends { parseComments: true }
          ? GFF3Item
          : GFF3Feature | GFF3Sequence | GFF3Directive
        : O extends { parseComments: true }
          ? GFF3Feature | GFF3Sequence | GFF3Comment
          : GFF3Feature | GFF3Sequence
      : O extends { parseSequences: false }
        ? O extends { parseDirectives: true }
          ? O extends { parseComments: true }
            ? GFF3Feature | GFF3Directive | GFF3Comment
            : GFF3Feature | GFF3Directive
          : O extends { parseComments: true }
            ? GFF3Feature | GFF3Comment
            : GFF3Feature
        : O extends { parseDirectives: true }
          ? O extends { parseComments: true }
            ? GFF3Item
            : GFF3Feature | GFF3Sequence | GFF3Directive
          : O extends { parseComments: true }
            ? GFF3Feature | GFF3Sequence | GFF3Comment
            : GFF3Feature | GFF3Sequence
    : O extends { parseFeatures: false }
      ? O extends { parseSequences: true }
        ? O extends { parseDirectives: true }
          ? O extends { parseComments: true }
            ? GFF3Sequence | GFF3Directive | GFF3Comment
            : GFF3Sequence | GFF3Directive
          : O extends { parseComments: true }
            ? GFF3Sequence | GFF3Comment
            : GFF3Sequence
        : O extends { parseSequences: false }
          ? O extends { parseDirectives: true }
            ? O extends { parseComments: true }
              ? GFF3Directive | GFF3Comment
              : GFF3Directive
            : O extends { parseComments: true }
              ? GFF3Comment
              : never
          : O extends { parseDirectives: true }
            ? O extends { parseComments: true }
              ? GFF3Sequence | GFF3Directive | GFF3Comment
              : GFF3Sequence | GFF3Directive
            : O extends { parseComments: true }
              ? GFF3Sequence | GFF3Comment
              : GFF3Sequence
      : O extends { parseSequences: true }
        ? O extends { parseDirectives: true }
          ? O extends { parseComments: true }
            ? GFF3Item
            : GFF3Feature | GFF3Sequence | GFF3Directive
          : O extends { parseComments: true }
            ? GFF3Feature | GFF3Sequence | GFF3Comment
            : GFF3Feature | GFF3Sequence
        : O extends { parseSequences: false }
          ? O extends { parseDirectives: true }
            ? O extends { parseComments: true }
              ? GFF3Feature | GFF3Directive | GFF3Comment
              : GFF3Feature | GFF3Directive
            : O extends { parseComments: true }
              ? GFF3Feature | GFF3Comment
              : GFF3Feature
          : O extends { parseDirectives: true }
            ? O extends { parseComments: true }
              ? GFF3Item
              : GFF3Feature | GFF3Sequence | GFF3Directive
            : O extends { parseComments: true }
              ? GFF3Feature | GFF3Sequence | GFF3Comment
              : GFF3Feature | GFF3Sequence,
> implements Transformer<Uint8Array, T>
{
  private decoder: TextDecoder
  private parser: GFF3Parser
  private lastString = ''
  private parseFeatures: boolean
  private parseDirectives: boolean
  private parseComments: boolean
  private parseSequences: boolean

  /**
   * Options for how the text stream is parsed
   * @param options - Parser options
   */
  constructor(options?: O) {
    this.decoder = new TextDecoder()
    const processedOptions = _processParseOptions(options ?? {})
    const { bufferSize, disableDerivesFromReferences } = processedOptions
    this.parser = new GFF3Parser({ bufferSize, disableDerivesFromReferences })
    this.parseFeatures = processedOptions.parseFeatures
    this.parseDirectives = processedOptions.parseDirectives
    this.parseComments = processedOptions.parseComments
    this.parseSequences = processedOptions.parseSequences
  }

  private makeCallbacks(controller: TransformStreamDefaultController<T>) {
    const callbacks: ParseCallbacks = {
      errorCallback: this.emitErrorMessage.bind(this, controller),
    }
    if (this.parseFeatures) {
      callbacks.featureCallback = (item: GFF3Feature) => {
        controller.enqueue(item as T)
      }
    }
    if (this.parseDirectives) {
      callbacks.directiveCallback = (item: GFF3Directive) => {
        controller.enqueue(item as T)
      }
    }
    if (this.parseComments) {
      callbacks.commentCallback = (item: GFF3Comment) => {
        controller.enqueue(item as T)
      }
    }
    if (this.parseSequences) {
      callbacks.sequenceCallback = (item: GFF3Sequence) => {
        controller.enqueue(item as T)
      }
    }
    return callbacks
  }

  private emitErrorMessage(
    controller: TransformStreamDefaultController<T>,
    errorMessage: string,
  ) {
    controller.error(errorMessage)
  }

  transform(
    chunk: Uint8Array,
    controller: TransformStreamDefaultController<T>,
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

  flush(controller: TransformStreamDefaultController<T>) {
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
 * Synchronously parse a string containing GFF3 and return an array of the
 * parsed items.
 *
 * @param str - GFF3 string
 * @param inputOptions - Parsing options
 * @returns array of parsed features, directives, comments and/or sequences
 */
export function parseStringSync<O extends ParseOptions>(
  str: string,
  inputOptions?: O,
): O extends { parseFeatures: true }
  ? O extends { parseSequences: true }
    ? O extends { parseDirectives: true }
      ? O extends { parseComments: true }
        ? GFF3Item[]
        : (GFF3Feature | GFF3Sequence | GFF3Directive)[]
      : O extends { parseComments: true }
        ? (GFF3Feature | GFF3Sequence | GFF3Comment)[]
        : (GFF3Feature | GFF3Sequence)[]
    : O extends { parseSequences: false }
      ? O extends { parseDirectives: true }
        ? O extends { parseComments: true }
          ? (GFF3Feature | GFF3Directive | GFF3Comment)[]
          : (GFF3Feature | GFF3Directive)[]
        : O extends { parseComments: true }
          ? (GFF3Feature | GFF3Comment)[]
          : GFF3Feature[]
      : O extends { parseDirectives: true }
        ? O extends { parseComments: true }
          ? GFF3Item[]
          : (GFF3Feature | GFF3Sequence | GFF3Directive)[]
        : O extends { parseComments: true }
          ? (GFF3Feature | GFF3Sequence | GFF3Comment)[]
          : (GFF3Feature | GFF3Sequence)[]
  : O extends { parseFeatures: false }
    ? O extends { parseSequences: true }
      ? O extends { parseDirectives: true }
        ? O extends { parseComments: true }
          ? (GFF3Sequence | GFF3Directive | GFF3Comment)[]
          : (GFF3Sequence | GFF3Directive)[]
        : O extends { parseComments: true }
          ? (GFF3Sequence | GFF3Comment)[]
          : GFF3Sequence[]
      : O extends { parseSequences: false }
        ? O extends { parseDirectives: true }
          ? O extends { parseComments: true }
            ? (GFF3Directive | GFF3Comment)[]
            : GFF3Directive[]
          : O extends { parseComments: true }
            ? GFF3Comment[]
            : never[]
        : O extends { parseDirectives: true }
          ? O extends { parseComments: true }
            ? (GFF3Sequence | GFF3Directive | GFF3Comment)[]
            : (GFF3Sequence | GFF3Directive)[]
          : O extends { parseComments: true }
            ? (GFF3Sequence | GFF3Comment)[]
            : GFF3Sequence[]
    : O extends { parseSequences: true }
      ? O extends { parseDirectives: true }
        ? O extends { parseComments: true }
          ? GFF3Item[]
          : (GFF3Feature | GFF3Sequence | GFF3Directive)[]
        : O extends { parseComments: true }
          ? (GFF3Feature | GFF3Sequence | GFF3Comment)[]
          : (GFF3Feature | GFF3Sequence)[]
      : O extends { parseSequences: false }
        ? O extends { parseDirectives: true }
          ? O extends { parseComments: true }
            ? (GFF3Feature | GFF3Directive | GFF3Comment)[]
            : (GFF3Feature | GFF3Directive)[]
          : O extends { parseComments: true }
            ? (GFF3Feature | GFF3Comment)[]
            : GFF3Feature[]
        : O extends { parseDirectives: true }
          ? O extends { parseComments: true }
            ? GFF3Item[]
            : (GFF3Feature | GFF3Sequence | GFF3Directive)[]
          : O extends { parseComments: true }
            ? (GFF3Feature | GFF3Sequence | GFF3Comment)[]
            : (GFF3Feature | GFF3Sequence)[] {
  if (!str) {
    return [] as any
  }

  const options = _processParseOptions(inputOptions ?? {})

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

  const parser = new GFF3Parser({
    disableDerivesFromReferences: options.disableDerivesFromReferences || false,
    bufferSize: Infinity,
  })

  str
    .split(/\r\n|[\r\n]/)
    .forEach((line) => parser.addLine.bind(parser)(line, callbacks))
  parser.finish(callbacks)

  return items as any
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
    this.insertVersionDirective =
      options.insertVersionDirective === false ? false : true
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
