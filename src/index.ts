import {
  parseStream,
  parseStringSync,
  formatSync,
  formatStream,
  formatFile,
  GFF3Comment,
  GFF3Directive,
  GFF3Feature,
  GFF3FeatureLine,
  GFF3FeatureLineWithRefs,
  GFF3Sequence,
  GFF3Item,
} from './api'

import * as util from './util'

export default {
  parseStream,
  parseStringSync,
  formatSync,
  formatStream,
  formatFile,
  util,
}

export type {
  GFF3Comment,
  GFF3Directive,
  GFF3Feature,
  GFF3FeatureLine,
  GFF3FeatureLineWithRefs,
  GFF3Sequence,
  GFF3Item,
}
