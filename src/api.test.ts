import { readFile } from 'fs/promises'
import { ReadableStream, WritableStream, TransformStream } from 'stream/web'
import { withFile } from 'tmp-promise'

import {
  GFFFormattingTransformer,
  GFFTransformer,
  formatSync,
  parseStringSync,
} from './api'
import { FileSource, SyncFileSink } from '../test/util'

describe('GFF3 formatting', () => {
  ;['spec_eden', 'au9_scaffold_subset', 'hybrid1', 'hybrid2'].forEach(
    (file) => {
      it(`can roundtrip ${file}.gff3 with formatSync`, async () => {
        const inputGFF3 = await readFile(
          require.resolve(`../test/data/${file}.gff3`),
          'utf8',
        )

        const expectedGFF3 = (
          await readFile(
            require.resolve(`../test/data/${file}.reformatted.gff3`),
            'utf8',
          )
        ).replaceAll('###\n', '') // formatSync does not insert sync marks

        const items = parseStringSync(inputGFF3, {
          parseComments: true,
          parseDirectives: true,
        })
        const resultGFF3 = formatSync(items)
        expect(resultGFF3).toEqual(expectedGFF3)
      })

      it(`can roundtrip ${file}.gff3 with formatStream`, async () => {
        const expectedGFF3 = await readFile(
          require.resolve(`../test/data/${file}.reformatted.gff3`),
          'utf8',
        )

        const stream = new ReadableStream(
          new FileSource(require.resolve(`../test/data/${file}.gff3`)),
        )
          .pipeThrough(
            new TransformStream(
              new GFFTransformer({
                parseFeatures: true,
                parseComments: true,
                parseDirectives: true,
              }),
            ),
          )
          .pipeThrough(new TransformStream(new GFFFormattingTransformer()))
        const chunks: string[] = []
        const reader = stream.getReader()
        let result: ReadableStreamReadResult<string>
        do {
          result = await reader.read()
          if (result.value !== undefined) {
            chunks.push(result.value)
          }
        } while (!result.done)
        const resultGFF3 = chunks.join('')
        expect(resultGFF3).toEqual(expectedGFF3)
      })
    },
  )
  ;[
    'spec_eden',
    'spec_eden.no_version_directive',
    'au9_scaffold_subset',
  ].forEach((file) => {
    it(`can roundtrip ${file}.gff3 with formatStream and insertVersionDirective`, async () => {
      jest.setTimeout(1000)
      await withFile(async (tmpFile) => {
        await new ReadableStream(
          new FileSource(require.resolve(`../test/data/${file}.gff3`)),
        )
          .pipeThrough(
            new TransformStream(
              new GFFTransformer({
                parseComments: true,
                parseDirectives: true,
              }),
            ),
          )
          .pipeThrough(
            new TransformStream(
              new GFFFormattingTransformer({ insertVersionDirective: true }),
            ),
          )
          .pipeTo(new WritableStream(new SyncFileSink(tmpFile.fd)))

        const resultGFF3 = await readFile(tmpFile.path, 'utf8')

        const expectedGFF3 = await readFile(
          require.resolve(`../test/data/${file}.reformatted.gff3`),
          'utf8',
        )

        expect(resultGFF3).toEqual(expectedGFF3)
      })
    })
  })
})
