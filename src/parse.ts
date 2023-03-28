import * as GFF3 from './util'

const containerAttributes = {
  Parent: 'child_features' as const,
  Derives_from: 'derived_features' as const,
}

export class FASTAParser {
  seqCallback: (sequence: GFF3.GFF3Sequence) => void
  currentSequence:
    | { id: string; sequence: string; description?: string }
    | undefined

  constructor(seqCallback: (sequence: GFF3.GFF3Sequence) => void) {
    this.seqCallback = seqCallback
    this.currentSequence = undefined
  }

  addLine(line: string): void {
    const defMatch = /^>\s*(\S+)\s*(.*)/.exec(line)
    if (defMatch) {
      this._flush()
      this.currentSequence = { id: defMatch[1], sequence: '' }
      if (defMatch[2]) {
        this.currentSequence.description = defMatch[2].trim()
      }
    } else if (this.currentSequence && /\S/.test(line)) {
      this.currentSequence.sequence += line.replaceAll(/\s/g, '')
    }
  }

  private _flush() {
    if (this.currentSequence) {
      this.seqCallback(this.currentSequence)
    }
  }

  finish(): void {
    this._flush()
  }
}

interface ParserArgs {
  featureCallback?(feature: GFF3.GFF3Feature): void
  endCallback?(): void
  commentCallback?(comment: GFF3.GFF3Comment): void
  errorCallback?(error: string): void
  directiveCallback?(directive: GFF3.GFF3Directive): void
  sequenceCallback?(sequence: GFF3.GFF3Sequence): void
  bufferSize?: number
  disableDerivesFromReferences?: boolean
}

interface References {
  Parent: GFF3.GFF3Feature[]
  Derives_from: GFF3.GFF3Feature[]
}

export default class Parser {
  featureCallback: (feature: GFF3.GFF3Feature) => void
  endCallback: () => void
  commentCallback: (comment: GFF3.GFF3Comment) => void
  errorCallback: (error: string) => void
  disableDerivesFromReferences: boolean
  directiveCallback: (directive: GFF3.GFF3Directive) => void
  sequenceCallback: (sequence: GFF3.GFF3Sequence) => void
  bufferSize: number
  fastaParser: FASTAParser | undefined = undefined
  // if this is true, the parser ignores the  rest of the lines in the file.
  // currently set when the file switches over to FASTA
  eof = false
  lineNumber = 0
  // features that we have to keep on hand for now because they might be
  // referenced by something else
  private _underConstructionTopLevel: GFF3.GFF3Feature[] = []
  // index of the above by ID
  private _underConstructionById: Record<string, GFF3.GFF3Feature | undefined> =
    {}
  private _completedReferences: Record<
    string,
    Record<string, boolean | undefined> | undefined
  > = {}
  // features that reference something we have not seen yet. structured as:
  // {  'some_id' : {
  //     'Parent' : [ orphans that have a Parent attr referencing it ],
  //     'Derives_from' : [ orphans that have a Derives_from attr referencing it ],
  //    }
  // }
  private _underConstructionOrphans: Record<string, References | undefined> = {}

  constructor(args: ParserArgs) {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const nullFunc = () => {}

    this.featureCallback = args.featureCallback || nullFunc
    this.endCallback = args.endCallback || nullFunc
    this.commentCallback = args.commentCallback || nullFunc
    this.errorCallback = args.errorCallback || nullFunc
    this.directiveCallback = args.directiveCallback || nullFunc
    this.sequenceCallback = args.sequenceCallback || nullFunc
    this.disableDerivesFromReferences =
      args.disableDerivesFromReferences || false

    // number of lines to buffer
    this.bufferSize = args.bufferSize === undefined ? 1000 : args.bufferSize
  }

  addLine(line: string): void {
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
      this._bufferLine(line)
      return
    }

    const match = /^\s*(#+)(.*)/.exec(line)
    if (match) {
      // directive or comment
      const [, hashsigns] = match
      let [, , contents] = match

      if (hashsigns.length === 3) {
        // sync directive, all forward-references are resolved.
        this._emitAllUnderConstructionFeatures()
      } else if (hashsigns.length === 2) {
        const directive = GFF3.parseDirective(line)
        if (directive) {
          if (directive.directive === 'FASTA') {
            this._emitAllUnderConstructionFeatures()
            this.eof = true
            this.fastaParser = new FASTAParser(this.sequenceCallback)
          } else {
            this._emitItem(directive)
          }
        }
      } else {
        contents = contents.replace(/\s*/, '')
        this._emitItem({ comment: contents })
      }
    } else if (/^\s*$/.test(line)) {
      // blank line, do nothing
    } else if (/^\s*>/.test(line)) {
      // implicit beginning of a FASTA section
      this._emitAllUnderConstructionFeatures()
      this.eof = true
      this.fastaParser = new FASTAParser(this.sequenceCallback)
      this.fastaParser.addLine(line)
    } else {
      // it's a parse error
      const errLine = line.replaceAll(/\r\n|[\r\n]$/g, '')
      throw new Error(`GFF3 parse error.  Cannot parse '${errLine}'.`)
    }
  }

  finish(): void {
    this._emitAllUnderConstructionFeatures()
    if (this.fastaParser) {
      this.fastaParser.finish()
    }
    this.endCallback()
  }

  private _emitItem(
    i: GFF3.GFF3Feature | GFF3.GFF3Directive | GFF3.GFF3Comment,
  ) {
    if (Array.isArray(i)) {
      this.featureCallback(i)
    } else if ('directive' in i) {
      this.directiveCallback(i)
    } else if ('comment' in i) {
      this.commentCallback(i)
    }
  }

  private _enforceBufferSizeLimit(additionalItemCount = 0) {
    const _unbufferItem = (item?: GFF3.GFF3Feature) => {
      if (item && Array.isArray(item) && item[0].attributes?.ID?.[0]) {
        const ids = item[0].attributes.ID
        ids.forEach((id) => {
          delete this._underConstructionById[id]
          delete this._completedReferences[id]
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
      this._underConstructionTopLevel.length + additionalItemCount >
      this.bufferSize
    ) {
      const item = this._underConstructionTopLevel.shift()
      if (item) {
        this._emitItem(item)
        _unbufferItem(item)
      }
    }
  }

  /**
   * return all under-construction features, called when we know there will be
   * no additional data to attach to them
   */
  private _emitAllUnderConstructionFeatures() {
    this._underConstructionTopLevel.forEach(this._emitItem.bind(this))

    this._underConstructionTopLevel = []
    this._underConstructionById = {}
    this._completedReferences = {}

    // if we have any orphans hanging around still, this is a problem. die with
    // a parse error
    if (Array.from(Object.values(this._underConstructionOrphans)).length) {
      throw new Error(
        `some features reference other features that do not exist in the file (or in the same '###' scope). ${Object.keys(
          this._underConstructionOrphans,
        ).join(',')}`,
      )
    }
  }

  // do the right thing with a newly-parsed feature line
  private _bufferLine(line: string) {
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
      this._emitItem([featureLine])
      return
    }

    let feature: GFF3.GFF3Feature | undefined = undefined
    ids.forEach((id) => {
      const existing = this._underConstructionById[id]
      if (existing) {
        // another location of the same feature
        if (existing[existing.length - 1].type !== featureLine.type) {
          this._parseError(
            `multi-line feature "${id}" has inconsistent types: "${
              featureLine.type
            }", "${existing[existing.length - 1].type}"`,
          )
        }
        existing.push(featureLine)
        feature = existing
      } else {
        // haven't seen it yet, so buffer it so we can attach child features to
        // it
        feature = [featureLine]

        this._enforceBufferSizeLimit(1)
        if (!parents.length && !derives.length) {
          this._underConstructionTopLevel.push(feature)
        }
        this._underConstructionById[id] = feature

        // see if we have anything buffered that refers to it
        this._resolveReferencesTo(feature, id)
      }
    })

    // try to resolve all its references
    this._resolveReferencesFrom(
      feature || [featureLine],
      { Parent: parents, Derives_from: derives },
      ids,
    )
  }

  private _resolveReferencesTo(feature: GFF3.GFF3Feature, id: string) {
    const references = this._underConstructionOrphans[id]
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
    delete this._underConstructionOrphans[id]
  }

  private _parseError(message: string) {
    this.eof = true
    this.errorCallback(`${this.lineNumber}: ${message}`)
  }

  private _resolveReferencesFrom(
    feature: GFF3.GFF3Feature,
    references: { Parent: string[]; Derives_from: string[] },
    ids: string[],
  ) {
    // this is all a bit more awkward in javascript than it was in perl
    function postSet(
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

    references.Parent.forEach((toId) => {
      const otherFeature = this._underConstructionById[toId]
      if (otherFeature) {
        const pname = containerAttributes.Parent
        if (
          !ids.filter((id) =>
            postSet(this._completedReferences, id, `Parent,${toId}`),
          ).length
        ) {
          otherFeature.forEach((location) => {
            location[pname].push(feature)
          })
        }
      } else {
        let ref = this._underConstructionOrphans[toId]
        if (!ref) {
          ref = {
            Parent: [],
            Derives_from: [],
          }
          this._underConstructionOrphans[toId] = ref
        }
        ref.Parent.push(feature)
      }
    })

    references.Derives_from.forEach((toId) => {
      const otherFeature = this._underConstructionById[toId]
      if (otherFeature) {
        const pname = containerAttributes.Derives_from
        if (
          !ids.filter((id) =>
            postSet(this._completedReferences, id, `Derives_from,${toId}`),
          ).length
        ) {
          otherFeature.forEach((location) => {
            location[pname].push(feature)
          })
        }
      } else {
        let ref = this._underConstructionOrphans[toId]
        if (!ref) {
          ref = {
            Parent: [],
            Derives_from: [],
          }
          this._underConstructionOrphans[toId] = ref
        }
        ref.Derives_from.push(feature)
      }
    })
  }
}
