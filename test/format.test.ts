import {
  createReadStream,
  createWriteStream,
  fdatasync as fdatasyncC,
  promises as fsPromises,
} from 'fs'
import tmp from 'tmp-promise'

import { promisify } from 'util'
import getStream from 'get-stream'

import gff from '../src'

const fdatasync = promisify(fdatasyncC)

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

        const items = gff.parseStringSync(inputGFF3, { parseAll: true })
        const resultGFF3 = gff.formatSync(items)
        expect(resultGFF3).toEqual(expectedGFF3)
      })

      it(`can roundtrip ${file}.gff3 with formatStream`, async () => {
        const expectedGFF3 = await fsPromises.readFile(
          require.resolve(`./data/${file}.reformatted.gff3`),
          'utf8',
        )

        const resultGFF3 = await getStream(
          createReadStream(require.resolve(`./data/${file}.gff3`))
            .pipe(
              gff.parseStream({
                parseFeatures: true,
                parseComments: true,
                parseDirectives: true,
              }),
            )
            .pipe(gff.formatStream()),
        )
        expect(resultGFF3).toEqual(expectedGFF3)
      })
    },
  )
  ;[
    'spec_eden',
    'spec_eden.no_version_directive',
    'au9_scaffold_subset',
  ].forEach((file) => {
    it(`can roundtrip ${file}.gff3 with formatFile`, async () => {
      jest.setTimeout(1000)
      await tmp.withFile(async (tmpFile) => {
        const gff3In = createReadStream(
          require.resolve(`./data/${file}.gff3`),
        ).pipe(gff.parseStream({ parseAll: true }))

        await gff.formatFile(gff3In, createWriteStream(tmpFile.path))
        await fdatasync(tmpFile.fd)

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
