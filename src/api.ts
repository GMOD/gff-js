import { Transform, TransformCallback, Readable, Writable } from 'stream'
import { StringDecoder as Decoder } from 'string_decoder'

import Parser from './parse'
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
  /** Text encoding of the input GFF3. default 'utf8' */
  encoding?: BufferEncoding
  /** Whether to parse features, default true */
  parseFeatures?: boolean
  /** Whether to parse directives, default false */
  parseDirectives?: boolean
  /** Whether to parse comments, default false */
  parseComments?: boolean
  /** Whether to parse sequences, default true */
  parseSequences?: boolean
  /**
   * Parse all features, directives, comments, and sequences. Overrides other
   * parsing options. Default false.
   */
  parseAll?: boolean
  /** Maximum number of GFF3 lines to buffer, default 1000 */
  bufferSize?: number
}

type ParseOptionsProcessed = Required<Omit<ParseOptions, 'parseAll'>>

// call a callback on the next process tick if running in
// an environment that supports it
function _callback(callback: TransformCallback) {
  if (process?.nextTick) {
    process.nextTick(callback)
  } else {
    callback()
  }
}

// shared arg processing for the parse routines
function _processParseOptions(options: ParseOptions): ParseOptionsProcessed {
  const out = {
    encoding: 'utf8' as const,
    parseFeatures: true,
    parseDirectives: false,
    parseSequences: true,
    parseComments: false,
    bufferSize: 1000,
    disableDerivesFromReferences: false,
    ...options,
  }

  if (options.parseAll) {
    out.parseFeatures = true
    out.parseDirectives = true
    out.parseComments = true
    out.parseSequences = true
  }

  return out
}

class GFFTransform extends Transform {
  encoding: BufferEncoding
  decoder: Decoder
  textBuffer = ''
  parser: Parser

  constructor(inputOptions: ParseOptions = {}) {
    super({ objectMode: true })
    const options = _processParseOptions(inputOptions)

    this.encoding = inputOptions.encoding || 'utf8'

    this.decoder = new Decoder()

    const push = this.push.bind(this)
    this.parser = new Parser({
      featureCallback: options.parseFeatures ? push : undefined,
      directiveCallback: options.parseDirectives ? push : undefined,
      commentCallback: options.parseComments ? push : undefined,
      sequenceCallback: options.parseSequences ? push : undefined,
      errorCallback: (err) => this.emit('error', err),
      bufferSize: options.bufferSize,
      disableDerivesFromReferences: options.disableDerivesFromReferences,
    })
  }

  private _addLine(data: string | undefined) {
    if (data) {
      this.parser.addLine(data)
    }
  }

  private _nextText(buffer: string) {
    const pieces = (this.textBuffer + buffer).split(/\r?\n/)
    this.textBuffer = pieces.pop() || ''

    pieces.forEach((piece) => this._addLine(piece))
  }

  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ) {
    this._nextText(this.decoder.write(chunk))
    _callback(callback)
  }

  _flush(callback: TransformCallback) {
    if (this.decoder.end) {
      this._nextText(this.decoder.end())
    }
    if (this.textBuffer != null) {
      this._addLine(this.textBuffer)
    }
    this.parser.finish()
    _callback(callback)
  }
}

/**
 * Parse a stream of text data into a stream of feature, directive, comment,
 * an sequence objects.
 *
 * @param options - Parsing options
 * @returns stream (in objectMode) of parsed items
 */
export function parseStream(options: ParseOptions = {}): GFFTransform {
  return new GFFTransform(options)
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
        encoding?: BufferEncoding
        bufferSize?: number
      }
    | undefined,
): (GFF3Feature | GFF3Sequence)[]
export function parseStringSync<T extends boolean>(
  str: string,
  inputOptions: {
    parseAll?: T
    disableDerivesFromReferences?: boolean
    encoding?: BufferEncoding
    bufferSize?: number
  },
): T extends true ? GFF3Item[] : never
export function parseStringSync<F extends boolean>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseFeatures: F
    encoding?: BufferEncoding
    bufferSize?: number
  },
): F extends true ? (GFF3Feature | GFF3Sequence)[] : GFF3Sequence[]
export function parseStringSync<D extends boolean>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseDirectives: D
    encoding?: BufferEncoding
    bufferSize?: number
  },
): D extends true
  ? (GFF3Feature | GFF3Directive | GFF3Sequence)[]
  : (GFF3Feature | GFF3Sequence)[]
export function parseStringSync<C extends boolean>(
  str: string,
  inputOptions: {
    parseComments: C
    encoding?: BufferEncoding
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
    encoding?: BufferEncoding
    bufferSize?: number
  },
): S extends true ? (GFF3Feature | GFF3Sequence)[] : GFF3Feature[]
export function parseStringSync<F extends boolean, D extends boolean>(
  str: string,
  inputOptions: {
    disableDerivesFromReferences?: boolean
    parseFeatures: F
    parseDirectives: D
    encoding?: BufferEncoding
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
    encoding?: BufferEncoding
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
    encoding?: BufferEncoding
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
    encoding?: BufferEncoding
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
    encoding?: BufferEncoding
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
    encoding?: BufferEncoding
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
    encoding?: BufferEncoding
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
    encoding?: BufferEncoding
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
    encoding?: BufferEncoding
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
    encoding?: BufferEncoding
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
    encoding?: BufferEncoding
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

  const parser = new Parser({
    featureCallback: options.parseFeatures ? push : undefined,
    directiveCallback: options.parseDirectives ? push : undefined,
    commentCallback: options.parseComments ? push : undefined,
    sequenceCallback: options.parseSequences ? push : undefined,
    disableDerivesFromReferences: options.disableDerivesFromReferences || false,
    bufferSize: Infinity,
    errorCallback: (err) => {
      throw err
    },
  })

  str.split(/\r?\n/).forEach(parser.addLine.bind(parser))
  parser.finish()

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
  let str = other.map(formatItem).join('')
  if (sequences.length) {
    str += '##FASTA\n'
    str += sequences.map(formatSequence).join('')
  }
  return str
}

interface FormatOptions {
  minSyncLines?: number
  insertVersionDirective?: boolean
  encoding?: BufferEncoding
}

class FormattingTransform extends Transform {
  linesSinceLastSyncMark = 0
  haveWeEmittedData = false
  fastaMode = false
  minLinesBetweenSyncMarks: number
  insertVersionDirective: boolean
  constructor(options: FormatOptions = {}) {
    super(Object.assign(options, { objectMode: true }))
    this.minLinesBetweenSyncMarks = options.minSyncLines || 100
    this.insertVersionDirective = options.insertVersionDirective || false
  }

  _transform(
    chunk: GFF3Item[],
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ) {
    // if we have not emitted anything yet, and this first chunk is not a
    // gff-version directive, emit one
    if (!this.haveWeEmittedData && this.insertVersionDirective) {
      const thisChunk = Array.isArray(chunk) ? chunk[0] : chunk
      if ('directive' in thisChunk) {
        if (thisChunk.directive !== 'gff-version') {
          this.push('##gff-version 3\n')
        }
      }
    }

    // if it's a sequence chunk coming down, emit a FASTA directive and change
    // to FASTA mode
    if ('sequence' in chunk && !this.fastaMode) {
      this.push('##FASTA\n')
      this.fastaMode = true
    }

    const str = Array.isArray(chunk)
      ? chunk.map(formatItem).join('')
      : formatItem(chunk)

    this.push(str)

    if (this.linesSinceLastSyncMark >= this.minLinesBetweenSyncMarks) {
      this.push('###\n')
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
    _callback(callback)
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
export function formatStream(options: FormatOptions = {}): FormattingTransform {
  return new FormattingTransform(options)
}

/**
 * Format a stream of features, directives, comments and/or sequences into a
 * GFF3 file and write it to the filesystem.

 * Inserts synchronization (###) marks and a ##gff-version directive
 * automatically (if one is not already present).
 *
 * @param stream - the stream to write to the file
 * @param filename - the file path to write to
 * @param options - parser options
 * @returns promise for null that resolves when the stream has been written
 */
export function formatFile(
  stream: Readable,
  writeStream: Writable,
  options: FormatOptions = {},
): Promise<null> {
  const newOptions = {
    insertVersionDirective: true,
    ...options,
  }

  return new Promise((resolve, reject) => {
    stream
      .pipe(new FormattingTransform(newOptions))
      .on('end', () => resolve(null))
      .on('error', reject)
      .pipe(writeStream)
  })
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
