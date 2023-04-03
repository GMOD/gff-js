import fsPromises from 'fs/promises'
import { ReadableStream, WritableStream, TransformStream } from 'stream/web'
import tmp from 'tmp-promise'

import gff from '../src'
import { FileSource, SyncFileSink } from './util'

describe('GFF3 formatting', () => {
  ;['spec_eden', 'au9_scaffold_subset', 'hybrid1', 'hybrid2'].forEach(
    (file) => {
      it(`can roundtrip ${file}.gff3 with formatSync`, async () => {
        const inputGFF3 = await fsPromises.readFile(
          require.resolve(`./data/${file}.gff3`),
          'utf8',
        )

        const expectedGFF3 = (
          await fsPromises.readFile(
            require.resolve(`./data/${file}.reformatted.gff3`),
            'utf8',
          )
        ).replaceAll('###\n', '') // formatSync does not insert sync marks

        const items = gff.parseStringSync(inputGFF3, {
          parseComments: true,
          parseDirectives: true,
        })
        const resultGFF3 = gff.formatSync(items)
        expect(resultGFF3).toEqual(expectedGFF3)
      })

      it(`can roundtrip ${file}.gff3 with formatStream`, async () => {
        const expectedGFF3 = await fsPromises.readFile(
          require.resolve(`./data/${file}.reformatted.gff3`),
          'utf8',
        )

        const stream = new ReadableStream(
          new FileSource(require.resolve(`./data/${file}.gff3`)),
        )
          .pipeThrough(
            new TransformStream(
              gff.parseStream({
                parseFeatures: true,
                parseComments: true,
                parseDirectives: true,
              }),
            ),
          )
          .pipeThrough(new TransformStream(gff.formatStream()))
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
      await tmp.withFile(async (tmpFile) => {
        await new ReadableStream(
          new FileSource(require.resolve(`./data/${file}.gff3`)),
        )
          .pipeThrough(
            new TransformStream(
              gff.parseStream({
                parseComments: true,
                parseDirectives: true,
              }),
            ),
          )
          .pipeThrough(
            new TransformStream(
              gff.formatStream({ insertVersionDirective: true }),
            ),
          )
          .pipeTo(new WritableStream(new SyncFileSink(tmpFile.fd)))

        const resultGFF3 = await fsPromises.readFile(tmpFile.path, 'utf8')

        const expectedGFF3 = await fsPromises.readFile(
          require.resolve(`./data/${file}.reformatted.gff3`),
          'utf8',
        )

        expect(resultGFF3).toEqual(expectedGFF3)
      })
    })
  })
})
