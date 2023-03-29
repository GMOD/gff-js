import * as api from './api'

export * from './api'

export type {
  GFF3Attributes,
  GFF3Comment,
  GFF3Directive,
  GFF3Feature,
  GFF3FeatureLine,
  GFF3FeatureLineWithRefs,
  GFF3GenomeBuildDirective,
  GFF3Item,
  GFF3Sequence,
  GFF3SequenceRegionDirective,
} from './util'

import * as util from './util'

export const defaultExport = {
  ...api,
  util,
}

export default defaultExport
