import {
  formatFile,
  formatStream,
  formatSync,
  parseStream,
  parseStringSync,
} from './api.ts'
import * as util from './util.ts'

export default {
  parseStream,
  parseStringSync,
  formatSync,
  formatStream,
  formatFile,
  util,
}

export {
  type GFF3Comment,
  type GFF3Directive,
  type GFF3Feature,
  type GFF3FeatureLine,
  type GFF3FeatureLineWithRefs,
  type GFF3Item,
  type GFF3Sequence,
} from './api.ts'
