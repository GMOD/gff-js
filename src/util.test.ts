import {
  escape,
  escapeColumn,
  formatAttributes,
  formatComment,
  formatDirective,
  formatFeature,
  formatItem,
  formatSequence,
  parseAttributes,
  parseDirective,
  parseFeature,
  unescape,
} from './util'

describe('unescape(stringVal)', () => {
  it('handles already unsecaped literals', () => {
    expect(unescape(' ')).toEqual(' ')
    expect(unescape('5')).toEqual('5')
  })
  it('handles escaped characters', () => {
    expect(unescape('%09')).toEqual('\t')
    expect(unescape('%09%0A%0D%25%3B%3D%26%2C')).toEqual('\t\n\r%;=&,')
  })
  it('unescapes everything, including spaces, mixed values, and non-specified characters.', () => {
    expect(unescape('escaped space: "%20", unescaped space: " "')).toEqual(
      'escaped space: " ", unescaped space: " "',
    )
  })
  it('unescapes an `escape()`d string', () => {
    const loremIpsum =
      'value=Lorem ipsum dolor sit amet, consectetur adipiscing elit.'
    expect(unescape(escape(loremIpsum))).toEqual(loremIpsum)
  })
})

describe('escape(rawval)', () => {
  it('escapes spec-specified characters', () => {
    expect(escape('\t')).toEqual('%09')
    expect(escape('\t\n\r%;=&,')).toEqual('%09%0A%0D%25%3B%3D%26%2C')
  })
  it("doesn't escape non-spec-specified characters", () => {
    expect(escape(' ')).toEqual(' ')
    expect(escape(5)).toEqual('5')
    expect(escape('\t\t + : \n')).toEqual('%09%09 + : %0A')
  })
})

describe('escapeColumn(rawval)', () => {
  it('escapes spec-specified column characters', () => {
    expect(escapeColumn('\t')).toEqual('%09')
    expect(escape('\t\n\r%')).toEqual('%09%0A%0D%25')
  })
  it("doesn't escape non-spec-specified characters", () => {
    expect(escapeColumn(' ')).toEqual(' ')
    expect(escapeColumn(5)).toEqual('5')
    expect(escapeColumn(';')).toEqual(';')
    expect(escapeColumn('\t\n\r%;=&,')).toEqual('%09%0A%0D%25;=&,')
  })
})

describe('parseAttributes(attrString)', () => {
  it('parses a simple attribute value', () => {
    expect(parseAttributes('foo=bar')).toEqual({ foo: ['bar'] })
  })
  it('parses an attribute with escaped values', () => {
    expect(parseAttributes('ID=Beep%2Cbonk%3B+Foo')).toEqual({
      ID: ['Beep,bonk;+Foo'],
    })
  })
  it('ignores keys with no value', () => {
    expect(parseAttributes('Target=Motif;rnd-family-27\n')).toEqual({
      Target: ['Motif'],
    })
  })
  it('parses an empty attribute', () => {
    expect(parseAttributes('.')).toEqual({})
  })
})

describe('parseFeature(line)', () => {
  it('parses a line with no missing values', () => {
    expect(
      parseFeature(
        'FooSeq\tbarsource\tmatch\t234\t234\t0\t+\t1\tID=Beep%2Cbonk%3B+Foo\n',
      ),
    ).toEqual({
      attributes: { ID: ['Beep,bonk;+Foo'] },
      end: 234,
      phase: '1',
      score: 0,
      seq_id: 'FooSeq',
      source: 'barsource',
      start: 234,
      strand: '+',
      type: 'match',
    })
  })
  it('parses a line with no values', () => {
    expect(parseFeature('.\t.\t.\t.\t.\t.\t.\t.\t.\n')).toEqual({
      attributes: null,
      end: null,
      phase: null,
      score: null,
      seq_id: null,
      source: null,
      start: null,
      strand: null,
      type: null,
    })
  })
  it('parses a line with escaped values (excluding column 9)', () => {
    const seq_id = 'ctgAt25%'
    const source = 'some\nsource'
    expect(
      parseFeature(
        `${escapeColumn(seq_id)}\t${escapeColumn(
          source,
        )}\tmatch\t300\t400\t.\t.\t.\t.\n`,
      ),
    ).toEqual({
      attributes: null,
      end: 400,
      phase: null,
      score: null,
      seq_id,
      source,
      start: 300,
      strand: null,
      type: 'match',
    })
  })
})

describe('parseDirective(line)', () => {
  it('parses a directive', () => {
    expect(parseDirective('##gff-version 3\n')).toEqual({
      directive: 'gff-version',
      value: '3',
    })
  })
  it('parses a genome-build directive', () => {
    expect(parseDirective('##genome-build WormBase ws110\n')).toEqual({
      directive: 'genome-build',
      value: 'WormBase ws110',
      source: 'WormBase',
      buildName: 'ws110',
    })
  })
  it('parses a sequence-region directive', () => {
    expect(parseDirective('##sequence-region ctg123 1 1497228\n')).toEqual({
      directive: 'sequence-region',
      value: 'ctg123 1 1497228',
      seq_id: 'ctg123',
      start: '1',
      end: '1497228',
    })
  })
  it('return null if the line is not a directive', () => {
    expect(
      parseDirective(
        'FooSeq\tbarsource\tmatch\t234\t234\t0\t+\t.\tID=Beep%2Cbonk%3B+Foo\n',
      ),
    ).toBeNull()
  })
  it("doesn't fail on a bad directive", () => {
    expect(() => {
      parseDirective('##sequence-region no_start_end_on_sequence_region')
    }).not.toThrow()
  })
})

describe('formatAttributes(attrs)', () => {
  it('formats a simple attribute value', () => {
    expect(formatAttributes({ foo: ['bar'] })).toEqual('foo=bar')
  })
  it('parses an attribute with escaped values and ignores keys with no value', () => {
    expect(formatAttributes({ ID: ['Beep,bonk;+Foo'] })).toEqual(
      'ID=Beep%2Cbonk%3B+Foo',
    )
  })
  it('parses an empty attribute', () => {
    expect(formatAttributes({})).toEqual('.')
  })
})

describe('formatFeature(featureOrFeatures)', () => {
  it('formats a single-line feature', () => {
    expect(
      formatFeature({
        attributes: { ID: ['Beep,bonk;+Foo'] },
        end: 234,
        phase: '1',
        score: 0,
        seq_id: 'FooSeq',
        source: 'barsource',
        start: 234,
        strand: '+',
        type: 'match',
      }),
    ).toEqual(
      'FooSeq\tbarsource\tmatch\t234\t234\t0\t+\t1\tID=Beep%2Cbonk%3B+Foo\n',
    )
  })
  it('formats a feature with a child', () => {
    expect(
      formatFeature({
        seq_id: 'ctgA',
        source: 'est',
        type: 'EST_match',
        start: 1050,
        end: 3202,
        score: null,
        strand: '+',
        phase: null,
        attributes: { ID: ['Match1'] },
        child_features: [
          [
            {
              seq_id: 'ctgA',
              source: 'est',
              type: 'match_part',
              start: 1050,
              end: 1500,
              score: null,
              strand: '+',
              phase: null,
              attributes: { Parent: ['Match1'] },
              child_features: [],
              derived_features: [],
            },
          ],
        ],
        derived_features: [],
      }),
    ).toEqual(
      `ctgA\test\tEST_match\t1050\t3202\t.\t+\t.\tID=Match1
ctgA\test\tmatch_part\t1050\t1500\t.\t+\t.\tParent=Match1
`,
    )
  })
  it('formats a feature with multiple locations', () => {
    expect(
      formatFeature([
        {
          seq_id: 'ctg123',
          source: null,
          type: 'CDS',
          start: 1201,
          end: 1500,
          score: null,
          strand: '+',
          phase: '0',
          attributes: { ID: ['cds00001'], Parent: ['mRNA00001'] },
          child_features: [],
          derived_features: [],
        },
        {
          seq_id: 'ctg123',
          source: null,
          type: 'CDS',
          start: 3000,
          end: 3902,
          score: null,
          strand: '+',
          phase: '0',
          attributes: { ID: ['cds00001'], Parent: ['mRNA00001'] },
          child_features: [],
          derived_features: [],
        },
      ]),
    ).toEqual(
      `ctg123\t.\tCDS\t1201\t1500\t.\t+\t0\tID=cds00001;Parent=mRNA00001
ctg123\t.\tCDS\t3000\t3902\t.\t+\t0\tID=cds00001;Parent=mRNA00001
`,
    )
  })
  it('formats a feature with the same child in child_features and derived_features', () => {
    expect(
      formatFeature([
        {
          seq_id: 'ctgA',
          source: 'est',
          type: 'parent',
          start: 1050,
          end: 3202,
          score: null,
          strand: '+',
          phase: null,
          attributes: { ID: ['Feature1'] },
          child_features: [
            [
              {
                seq_id: 'ctgA',
                source: 'est',
                type: 'child',
                start: 1050,
                end: 1500,
                score: null,
                strand: '+',
                phase: null,
                attributes: {
                  Parent: ['Feature1'],
                  Derives_from: ['Feature1'],
                },
                child_features: [],
                derived_features: [],
              },
            ],
          ],
          derived_features: [
            [
              {
                seq_id: 'ctgA',
                source: 'est',
                type: 'child',
                start: 1050,
                end: 1500,
                score: null,
                strand: '+',
                phase: null,
                attributes: {
                  Parent: ['Feature1'],
                  Derives_from: ['Feature1'],
                },
                child_features: [],
                derived_features: [],
              },
            ],
          ],
        },
      ]),
    ).toEqual(`ctgA\test\tparent\t1050\t3202\t.\t+\t.\tID=Feature1
ctgA\test\tchild\t1050\t1500\t.\t+\t.\tParent=Feature1;Derives_from=Feature1
`)
  })
})

describe('formatDirective(directive)', () => {
  it('formats a directive', () => {
    expect(formatDirective({ directive: 'gff-version', value: '3' })).toEqual(
      '##gff-version 3\n',
    )
  })
  it('formats a genome-build directive', () => {
    expect(
      formatDirective({
        directive: 'genome-build',
        value: 'WormBase ws110',
        source: 'WormBase',
        buildName: 'ws110',
      }),
    ).toEqual('##genome-build WormBase ws110\n')
  })
  it('formats a sequence-region directive', () => {
    expect(
      formatDirective({
        directive: 'sequence-region',
        value: 'ctg123 1 1497228',
        seq_id: 'ctg123',
        start: '1',
        end: '1497228',
      }),
    ).toEqual('##sequence-region ctg123 1 1497228\n')
  })
})

describe('formatComment(comment)', () => {
  it('formats a comment', () => {
    expect(formatComment({ comment: 'my comment' })).toEqual('# my comment\n')
  })
})

describe('formatSequence(seq)', () => {
  it('formats a short sequence', () => {
    expect(
      formatSequence({
        id: 'ctg123',
        description: 'test contig',
        sequence: 'ACTGACTAGCTAGCATCAGCGTCGTAGCTATTATATTACGGTAGCCA',
      }),
    ).toEqual(
      `>ctg123 test contig
ACTGACTAGCTAGCATCAGCGTCGTAGCTATTATATTACGGTAGCCA
`,
    )
  })
  it('formats a sequence with no description', () => {
    expect(
      formatSequence({
        id: 'ctg123',
        sequence: 'ACTGACTAGCTAGCATCAGCGTCGTAGCTATTATATTACGGTAGCCA',
      }),
    ).toEqual(
      `>ctg123
ACTGACTAGCTAGCATCAGCGTCGTAGCTATTATATTACGGTAGCCA
`,
    )
  })
  it('folds sequences longer than 80 characters', () => {
    expect(
      formatSequence({
        id: 'ctg123',
        sequence:
          'ACTGACTAGCTAGCATCAGCGTCGTAGCTATTATATTACGGTAGCCAACTGACTAGCTAGCATCAGCGTCGTAGCTATTATATTACGGTAGCCA',
      }),
    ).toEqual(
      `>ctg123
ACTGACTAGCTAGCATCAGCGTCGTAGCTATTATATTACGGTAGCCAACTGACTAGCTAGCATCAGCGTCGTAGCTATTA
TATTACGGTAGCCA
`,
    )
  })
})

describe('formatItem(itemOrItems)', () => {
  it('formats a single item', () => {
    expect(formatItem({ directive: 'gff-version', value: '3' })).toEqual(
      '##gff-version 3\n',
    )
  })
  it('formats an array of items', () => {
    expect(
      formatItem([
        { directive: 'gff-version', value: '3' },
        { comment: 'my comment' },
        {
          attributes: { ID: ['Beep,bonk;+Foo'] },
          end: 234,
          phase: '1',
          score: 0,
          seq_id: 'FooSeq',
          source: 'barsource',
          start: 234,
          strand: '+',
          type: 'match',
          child_features: [],
          derived_features: [],
        },
        {
          id: 'ctg123',
          description: 'test contig',
          sequence: 'ACTGACTAGCTAGCATCAGCGTCGTAGCTATTATATTACGGTAGCCA',
        },
      ]),
    ).toEqual([
      '##gff-version 3\n',
      '# my comment\n',
      'FooSeq\tbarsource\tmatch\t234\t234\t0\t+\t1\tID=Beep%2Cbonk%3B+Foo\n',
      '>ctg123 test contig\nACTGACTAGCTAGCATCAGCGTCGTAGCTATTATATTACGGTAGCCA\n',
    ])
  })
})
