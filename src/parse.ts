import * as GFF3 from './util'

const containerAttributes = {
  Parent: 'child_features' as const,
  Derives_from: 'derived_features' as const,
}

export interface ParseCallbacks {
  featureCallback?(feature: GFF3.GFF3Feature): void
  commentCallback?(comment: GFF3.GFF3Comment): void
  errorCallback?(error: string): void
  directiveCallback?(directive: GFF3.GFF3Directive): void
  sequenceCallback?(sequence: GFF3.GFF3Sequence): void
}

export class FASTAParser {
  currentSequence:
    | { id: string; sequence: string; description?: string }
    | undefined

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    private seqCallback: (sequence: GFF3.GFF3Sequence) => void = () => {},
  ) {
    this.currentSequence = undefined
  }

  addLine(line: string): void {
    const defMatch = /^>\s*(\S+)\s*(.*)/.exec(line)
    if (defMatch) {
      this.flush()
      this.currentSequence = { id: defMatch[1], sequence: '' }
      if (defMatch[2]) {
        this.currentSequence.description = defMatch[2].trim()
      }
    } else if (this.currentSequence && /\S/.test(line)) {
      this.currentSequence.sequence += line.replaceAll(/\s/g, '')
    }
  }

  private flush() {
    if (this.currentSequence) {
      this.seqCallback(this.currentSequence)
    }
  }

  finish(): void {
    this.flush()
  }
}

interface ParserArgs {
  endCallback?(): void
  bufferSize?: number
  disableDerivesFromReferences?: boolean
}

interface References {
  Parent: GFF3.GFF3Feature[]
  Derives_from: GFF3.GFF3Feature[]
}

export default class Parser {
  endCallback: () => void
  disableDerivesFromReferences: boolean
  bufferSize: number
  fastaParser: FASTAParser | undefined = undefined
  // if this is true, the parser ignores the  rest of the lines in the file.
  // currently set when the file switches over to FASTA
  eof = false
  lineNumber = 0
  // features that we have to keep on hand for now because they might be
  // referenced by something else
  private underConstructionTopLevel: GFF3.GFF3Feature[] = []
  // index of the above by ID
  private underConstructionById: Record<string, GFF3.GFF3Feature | undefined> =
    {}
  private completedReferences: Record<
    string,
    Record<string, boolean | undefined> | undefined
  > = {}
  // features that reference something we have not seen yet. structured as:
  // {  'some_id' : {
  //     'Parent' : [ orphans that have a Parent attr referencing it ],
  //     'Derives_from' : [ orphans that have a Derives_from attr referencing it ],
  //    }
  // }
  private underConstructionOrphans = new Map<string, References | undefined>()

  constructor(args: ParserArgs) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const nullFunc = () => {}

    this.endCallback = args.endCallback || nullFunc
    this.disableDerivesFromReferences =
      args.disableDerivesFromReferences || false

    // number of lines to buffer
    this.bufferSize = args.bufferSize === undefined ? 50000 : args.bufferSize
  }

  addLine(line: string, callbacks: ParseCallbacks): void {
    // if we have transitioned to a fasta section, just delegate to that parser
    if (this.fastaParser) {
      this.fastaParser.addLine(line)
      return
    }
    if (this.eof) {
      // otherwise, if we are done, ignore this line
      return
    }

    this.lineNumber += 1

    if (/^\s*[^#\s>]/.test(line)) {
      // feature line, most common case
      this.bufferLine(line, callbacks)
      return
    }

    const match = /^\s*(#+)(.*)/.exec(line)
    if (match) {
      // directive or comment
      const [, hashsigns] = match
      let [, , contents] = match

      if (hashsigns.length === 3) {
        // sync directive, all forward-references are resolved.
        this.emitAllUnderConstructionFeatures(callbacks)
      } else if (hashsigns.length === 2) {
        const directive = GFF3.parseDirective(line)
        if (directive) {
          if (directive.directive === 'FASTA') {
            this.emitAllUnderConstructionFeatures(callbacks)
            this.eof = true
            this.fastaParser = new FASTAParser(callbacks.sequenceCallback)
          } else {
            this.emitItem(directive, callbacks)
          }
        }
      } else {
        contents = contents.replace(/\s*/, '')
        this.emitItem({ comment: contents }, callbacks)
      }
    } else if (/^\s*$/.test(line)) {
      // blank line, do nothing
    } else if (/^\s*>/.test(line)) {
      // implicit beginning of a FASTA section
      this.emitAllUnderConstructionFeatures(callbacks)
      this.eof = true
      this.fastaParser = new FASTAParser(callbacks.sequenceCallback)
      this.fastaParser.addLine(line)
    } else {
      // it's a parse error
      const errLine = line.replaceAll(/\r\n|[\r\n]$/g, '')
      throw new Error(`GFF3 parse error. Cannot parse '${errLine}'.`)
    }
  }

  finish(callbacks: ParseCallbacks): void {
    this.emitAllUnderConstructionFeatures(callbacks)
    if (this.fastaParser) {
      this.fastaParser.finish()
    }
    this.endCallback()
  }

  private emitItem(
    i: GFF3.GFF3Feature | GFF3.GFF3Directive | GFF3.GFF3Comment,
    callbacks: ParseCallbacks,
  ) {
    if (Array.isArray(i) && callbacks.featureCallback) {
      callbacks.featureCallback(i)
    } else if ('directive' in i && callbacks.directiveCallback) {
      callbacks.directiveCallback(i)
    } else if ('comment' in i && callbacks.commentCallback) {
      callbacks.commentCallback(i)
    }
  }

  private enforceBufferSizeLimit(
    additionalItemCount = 0,
    callbacks: ParseCallbacks,
  ) {
    const _unbufferItem = (item?: GFF3.GFF3Feature) => {
      if (item && Array.isArray(item) && item[0].attributes?.ID?.[0]) {
        const ids = item[0].attributes.ID
        ids.forEach((id) => {
          delete this.underConstructionById[id]
          delete this.completedReferences[id]
        })
        item.forEach((i) => {
          if (i.child_features) {
            i.child_features.forEach((c) => _unbufferItem(c))
          }
          if (i.derived_features) {
            i.derived_features.forEach((d) => _unbufferItem(d))
          }
        })
      }
    }

    while (
      this.underConstructionTopLevel.length + additionalItemCount >
      this.bufferSize
    ) {
      const item = this.underConstructionTopLevel.shift()
      if (item) {
        this.emitItem(item, callbacks)
        _unbufferItem(item)
      }
    }
  }

  /**
   * return all under-construction features, called when we know there will be
   * no additional data to attach to them
   */
  private emitAllUnderConstructionFeatures(callbacks: ParseCallbacks) {
    this.underConstructionTopLevel.forEach((f) =>
      this.emitItem.bind(this)(f, callbacks),
    )

    this.underConstructionTopLevel = []
    this.underConstructionById = {}
    this.completedReferences = {}

    // if we have any orphans hanging around still, this is a problem. die with
    // a parse error
    if (this.underConstructionOrphans.size) {
      throw new Error(
        `some features reference other features that do not exist in the file (or in the same '###' scope). ${Array.from(
          this.underConstructionOrphans.keys(),
        ).join(',')}`,
      )
    }
  }

  // do the right thing with a newly-parsed feature line
  private bufferLine(line: string, callbacks: ParseCallbacks) {
    const rawFeatureLine = GFF3.parseFeature(line)
    const featureLine: GFF3.GFF3FeatureLineWithRefs = {
      ...rawFeatureLine,
      child_features: [],
      derived_features: [],
    }
    // featureLine._lineNumber = this.lineNumber //< debugging aid

    // NOTE: a feature is an arrayref of one or more feature lines.
    const ids = featureLine.attributes?.ID || []
    const parents = featureLine.attributes?.Parent || []
    const derives = this.disableDerivesFromReferences
      ? []
      : featureLine.attributes?.Derives_from || []

    if (!ids.length && !parents.length && !derives.length) {
      // if it has no IDs and does not refer to anything, we can just output it
      this.emitItem([featureLine], callbacks)
      return
    }

    let feature: GFF3.GFF3Feature | undefined = undefined
    ids.forEach((id) => {
      const existing = this.underConstructionById[id]
      if (existing) {
        // another location of the same feature
        if (existing[existing.length - 1].type !== featureLine.type) {
          this.parseError(
            `multi-line feature "${id}" has inconsistent types: "${
              featureLine.type
            }", "${existing[existing.length - 1].type}"`,
            callbacks,
          )
        }
        existing.push(featureLine)
        feature = existing
      } else {
        // haven't seen it yet, so buffer it so we can attach child features to
        // it
        feature = [featureLine]

        this.enforceBufferSizeLimit(1, callbacks)
        if (!parents.length && !derives.length) {
          this.underConstructionTopLevel.push(feature)
        }
        this.underConstructionById[id] = feature

        // see if we have anything buffered that refers to it
        this.resolveReferencesTo(feature, id)
      }
    })

    // try to resolve all its references
    this.resolveReferencesFrom(
      feature || [featureLine],
      { Parent: parents, Derives_from: derives },
      ids,
    )
  }

  private resolveReferencesTo(feature: GFF3.GFF3Feature, id: string) {
    const references = this.underConstructionOrphans.get(id)
    //   references is of the form
    //   {
    //     'Parent' : [ orphans that have a Parent attr referencing this feature ],
    //     'Derives_from' : [ orphans that have a Derives_from attr referencing this feature ],
    //    }
    if (!references) {
      return
    }
    feature.forEach((loc) => {
      loc.child_features.push(...references.Parent)
    })
    feature.forEach((loc) => {
      loc.derived_features.push(...references.Derives_from)
    })
    this.underConstructionOrphans.delete(id)
  }

  private parseError(message: string, callbacks: ParseCallbacks) {
    this.eof = true
    callbacks.errorCallback?.(`${this.lineNumber}: ${message}`)
  }

  // this is all a bit more awkward in javascript than it was in perl
  private postSet(
    obj: Record<string, Record<string, boolean | undefined> | undefined>,
    slot1: string,
    slot2: string,
  ) {
    let subObj = obj[slot1]
    if (!subObj) {
      subObj = {}
      obj[slot1] = subObj
    }
    const returnVal = subObj[slot2] || false
    subObj[slot2] = true
    return returnVal
  }

  private resolveReferencesFrom(
    feature: GFF3.GFF3Feature,
    references: { Parent: string[]; Derives_from: string[] },
    ids: string[],
  ) {
    references.Parent.forEach((toId) => {
      const otherFeature = this.underConstructionById[toId]
      if (otherFeature) {
        const pname = containerAttributes.Parent
        if (
          !ids.filter((id) =>
            this.postSet(this.completedReferences, id, `Parent,${toId}`),
          ).length
        ) {
          otherFeature.forEach((location) => {
            location[pname].push(feature)
          })
        }
      } else {
        let ref = this.underConstructionOrphans.get(toId)
        if (!ref) {
          ref = {
            Parent: [],
            Derives_from: [],
          }
          this.underConstructionOrphans.set(toId, ref)
        }
        ref.Parent.push(feature)
      }
    })

    references.Derives_from.forEach((toId) => {
      const otherFeature = this.underConstructionById[toId]
      if (otherFeature) {
        const pname = containerAttributes.Derives_from
        if (
          !ids.filter((id) =>
            this.postSet(this.completedReferences, id, `Derives_from,${toId}`),
          ).length
        ) {
          otherFeature.forEach((location) => {
            location[pname].push(feature)
          })
        }
      } else {
        let ref = this.underConstructionOrphans.get(toId)
        if (!ref) {
          ref = {
            Parent: [],
            Derives_from: [],
          }
          this.underConstructionOrphans.set(toId, ref)
        }
        ref.Derives_from.push(feature)
      }
    })
  }
}
