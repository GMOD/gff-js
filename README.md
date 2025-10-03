# @gmod/gff

[![Build Status](https://img.shields.io/github/actions/workflow/status/GMOD/gff-js/push.yml?branch=master&logo=github&style=for-the-badge)](https://github.com/GMOD/gff-js/actions?query=branch%3Amaster+workflow%3APush+)

Read and write GFF3 data performantly. This module aims to be a complete
implementation of the [GFF3
specification](https://github.com/The-Sequence-Ontology/Specifications/blob/master/gff3.md).

**NOTE: this module uses the NPM stream package, which requires node.js polyfills for use on the web. We also created the https://github.com/cmdcolin/gff-nostream package to allow a non-streaming version that does not require polyfills**

- streaming parsing and streaming formatting
- proper escaping and unescaping of attribute and column values
- supports features with multiple locations and features with multiple parents
- reconstructs feature hierarchies of both `Parent` and `Derives_from`
  relationships
- parses FASTA sections
- does no validation except for referential integrity of `Parent` and
  `Derives_from` relationships (can disable Derives_from reference checking
  with `disableDerivesFromReferences`)
- only compatible with GFF3

## Compatability

Works in the browser and with Node.js v18 and up.

## Install

    $ npm install --save @gmod/gff

## Usage

### Node.js example

```js
import {
  createReadStream,
  createWriteStream,
  readFileSync,
  writeFileSync,
} from 'fs'
import { Readable, Writable } from 'stream'
import { TransformStream } from 'stream/web'
import {
  formatSync,
  parseStringSync,
  GFFTransformer,
  GFFFormattingTransformer,
} from '@gmod/gff'

// parse a file from a file name. parses only features and sequences by default,
// set options to parse directives and/or comments
;(async () => {
  const readStream = createReadStream('/path/to/my/file.gff3')
  const streamOfGFF3 = Readable.toWeb(readStream).pipeThrough(
    new TransformStream(
      new GFFTransformer({ parseComments: true, parseDirectives: true }),
    ),
  )
  for await (const data of streamOfGFF3) {
    if ('directive' in data) {
      console.log('got a directive', data)
    } else if ('comment' in data) {
      console.log('got a comment', data)
    } else if ('sequence' in data) {
      console.log('got a sequence from a FASTA section')
    } else {
      console.log('got a feature', data)
    }
  }

  // parse a string of gff3 synchronously
  const stringOfGFF3 = readFileSync('/path/to/my/file.gff3', 'utf8')
  const arrayOfGFF3ITems = parseStringSync(stringOfGFF3)

  // format an array of items to a string
  const newStringOfGFF3 = formatSync(arrayOfGFF3ITems)
  writeFileSync('/path/to/new/file.gff3', newStringOfGFF3)

  // read a file, format it, and write it to a new file. inserts sync marks and
  // a '##gff-version 3' header if one is not already present
  await Readable.toWeb(createReadStream('/path/to/my/file.gff3'))
    .pipeThrough(
      new TransformStream(
        new GFFTransformer({ parseComments: true, parseDirectives: true }),
      ),
    )
    .pipeThrough(new TransformStream(new GFFFormattingTransformer()))
    .pipeTo(Writable.toWeb(createWriteStream('/path/to/my/file.gff3')))
})()
```

### Browser example

```js
import { GFFTransformer } from '@gmod/gff'

// parse a file from a URL. parses only features and sequences by default, set
// options to parse directives and/or comments
;(async () => {
  const response = await fetch('http://example.com/file.gff3')
  if (!response.ok) {
    throw new Error('Bad response')
  }
  if (!response.body) {
    throw new Error('No response body')
  }
  const streamOfGFF3 = response.body.pipeThrough(
    new TransformStream(
      new GFFTransformer({ parseComments: true, parseDirectives: true }),
    ),
  )
  for await (const chunk of streamOfGFF3) {
    if ('directive' in data) {
      console.log('got a directive', data)
    } else if ('comment' in data) {
      console.log('got a comment', data)
    } else if ('sequence' in data) {
      console.log('got a sequence from a FASTA section')
    } else {
      console.log('got a feature', data)
    }
  }
})()
```

## Object format

### features

In GFF3, features can have more than one location. We parse features
as arrayrefs of all the lines that share that feature's ID.
Values that are `.` in the GFF3 are `null` in the output.

A simple feature that's located in just one place:

```json
[
  {
    "seq_id": "ctg123",
    "source": null,
    "type": "gene",
    "start": 1000,
    "end": 9000,
    "score": null,
    "strand": "+",
    "phase": null,
    "attributes": {
      "ID": ["gene00001"],
      "Name": ["EDEN"]
    },
    "child_features": [],
    "derived_features": []
  }
]
```

A CDS called `cds00001` located in two places:

```json
[
  {
    "seq_id": "ctg123",
    "source": null,
    "type": "CDS",
    "start": 1201,
    "end": 1500,
    "score": null,
    "strand": "+",
    "phase": "0",
    "attributes": {
      "ID": ["cds00001"],
      "Parent": ["mRNA00001"]
    },
    "child_features": [],
    "derived_features": []
  },
  {
    "seq_id": "ctg123",
    "source": null,
    "type": "CDS",
    "start": 3000,
    "end": 3902,
    "score": null,
    "strand": "+",
    "phase": "0",
    "attributes": {
      "ID": ["cds00001"],
      "Parent": ["mRNA00001"]
    },
    "child_features": [],
    "derived_features": []
  }
]
```

### directives

```js
parseDirective("##gff-version 3\n")
// returns
{
  "directive": "gff-version",
  "value": "3"
}
```

```js
parseDirective('##sequence-region ctg123 1 1497228\n')
// returns
{
  "directive": "sequence-region",
  "value": "ctg123 1 1497228",
  "seq_id": "ctg123",
  "start": "1",
  "end": "1497228"
}
```

### comments

```js
parseComment('# hi this is a comment\n')
// returns
{
  "comment": "hi this is a comment"
}
```

### sequences

These come from any embedded `##FASTA` section in the GFF3 file.

```js
parseSequences(`##FASTA
>ctgA test contig
ACTGACTAGCTAGCATCAGCGTCGTAGCTATTATATTACGGTAGCCA`)[
  // returns
  {
    id: 'ctgA',
    description: 'test contig',
    sequence: 'ACTGACTAGCTAGCATCAGCGTCGTAGCTATTATATTACGGTAGCCA',
  }
]
```

## API

<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

#### Table of Contents

- [ParseOptions](#parseoptions)
  - [disableDerivesFromReferences](#disablederivesfromreferences)
  - [parseFeatures](#parsefeatures)
  - [parseDirectives](#parsedirectives)
  - [parseComments](#parsecomments)
  - [parseSequences](#parsesequences)
  - [bufferSize](#buffersize)
- [GFFTransformer](#gfftransformer)
  - [Parameters](#parameters)
- [parseStringSync](#parsestringsync)
  - [Parameters](#parameters-1)
- [formatSync](#formatsync)
  - [Parameters](#parameters-2)
- [FormatOptions](#formatoptions)
  - [minSyncLines](#minsynclines)
  - [insertVersionDirective](#insertversiondirective)
- [GFFFormattingTransformer](#gffformattingtransformer)
  - [Parameters](#parameters-3)

### ParseOptions

Parser options

#### disableDerivesFromReferences

Whether to resolve references to derives from features

Type: [boolean](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Boolean)

#### parseFeatures

Whether to parse features, default true

Type: [boolean](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Boolean)

#### parseDirectives

Whether to parse directives, default false

Type: [boolean](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Boolean)

#### parseComments

Whether to parse comments, default false

Type: [boolean](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Boolean)

#### parseSequences

Whether to parse sequences, default true

Type: [boolean](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Boolean)

#### bufferSize

Maximum number of GFF3 lines to buffer, default Infinity

Type: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)

### GFFTransformer

Parse a stream of text data into a stream of feature, directive, comment,
an sequence objects.

#### Parameters

- `options` **O?** Parser options

### parseStringSync

Synchronously parse a string containing GFF3 and return an array of the
parsed items.

#### Parameters

- `str` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** GFF3 string
- `inputOptions` **O?** Parsing options

Returns **any** array of parsed features, directives, comments and/or sequences

### formatSync

Format an array of GFF3 items (features,directives,comments) into string of
GFF3. Does not insert synchronization (###) marks.

#### Parameters

- `items` **[Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)\<GFF3Item>** Array of features, directives, comments and/or sequences

Returns **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** the formatted GFF3

### FormatOptions

Formatter options

#### minSyncLines

The minimum number of lines to emit between sync (###) directives, default
100

Type: [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)

#### insertVersionDirective

Whether to insert a version directive at the beginning of a formatted
stream if one does not exist already, default true

Type: [boolean](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Boolean)

### GFFFormattingTransformer

Transform a stream of features, directives, comments and/or sequences into a
stream of GFF3 text.

Inserts synchronization (###) marks automatically.

#### Parameters

- `options` **[FormatOptions](#formatoptions)** Formatter options (optional, default `{}`)

## About `util`

There is also a `util` module that contains super-low-level functions for dealing with lines and parts of lines.

```js
import { util } from '@gmod/gff'

const gff3Lines = util.formatItem({
  seq_id: 'ctgA',
  ...
})
```

## util

<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

#### Table of Contents

- [unescape](#unescape)
  - [Parameters](#parameters)
- [escape](#escape)
  - [Parameters](#parameters-1)
- [escapeColumn](#escapecolumn)
  - [Parameters](#parameters-2)
- [parseAttributes](#parseattributes)
  - [Parameters](#parameters-3)
- [parseFeature](#parsefeature)
  - [Parameters](#parameters-4)
- [parseDirective](#parsedirective)
  - [Parameters](#parameters-5)
- [formatAttributes](#formatattributes)
  - [Parameters](#parameters-6)
- [formatFeature](#formatfeature)
  - [Parameters](#parameters-7)
- [formatDirective](#formatdirective)
  - [Parameters](#parameters-8)
- [formatComment](#formatcomment)
  - [Parameters](#parameters-9)
- [formatSequence](#formatsequence)
  - [Parameters](#parameters-10)
- [formatItem](#formatitem)
  - [Parameters](#parameters-11)
- [GFF3Attributes](#gff3attributes)
- [GFF3FeatureLine](#gff3featureline)
  - [seq_id](#seq_id)
  - [source](#source)
  - [type](#type)
  - [start](#start)
  - [end](#end)
  - [score](#score)
  - [strand](#strand)
  - [phase](#phase)
  - [attributes](#attributes)
- [GFF3FeatureLineWithRefs](#gff3featurelinewithrefs)
  - [child_features](#child_features)
  - [derived_features](#derived_features)
- [GFF3Feature](#gff3feature)
- [BaseGFF3Directive](#basegff3directive)
  - [directive](#directive)
  - [value](#value)
- [GFF3SequenceRegionDirective](#gff3sequenceregiondirective)
  - [value](#value-1)
  - [seq_id](#seq_id-1)
  - [start](#start-1)
  - [end](#end-1)
- [GFF3GenomeBuildDirective](#gff3genomebuilddirective)
  - [value](#value-2)
  - [source](#source-1)
  - [buildName](#buildname)
- [GFF3Comment](#gff3comment)
  - [comment](#comment)
- [GFF3Sequence](#gff3sequence)
  - [id](#id)
  - [description](#description)
  - [sequence](#sequence)

### unescape

Unescape a string value used in a GFF3 attribute.

#### Parameters

- `stringVal` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** Escaped GFF3 string value

Returns **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** An unescaped string value

### escape

Escape a value for use in a GFF3 attribute value.

#### Parameters

- `rawVal` **([string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) | [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number))** Raw GFF3 attribute value

Returns **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** An escaped string value

### escapeColumn

Escape a value for use in a GFF3 column value.

#### Parameters

- `rawVal` **([string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) | [number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number))** Raw GFF3 column value

Returns **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** An escaped column value

### parseAttributes

Parse the 9th column (attributes) of a GFF3 feature line.

#### Parameters

- `attrString` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** String of GFF3 9th column

Returns **[GFF3Attributes](#gff3attributes)** Parsed attributes

### parseFeature

Parse a GFF3 feature line

#### Parameters

- `line` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** GFF3 feature line

Returns **[GFF3FeatureLine](#gff3featureline)** The parsed feature

### parseDirective

Parse a GFF3 directive line.

#### Parameters

- `line` **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** GFF3 directive line

Returns **(GFF3Directive | [GFF3SequenceRegionDirective](#gff3sequenceregiondirective) | [GFF3GenomeBuildDirective](#gff3genomebuilddirective) | null)** The parsed directive

### formatAttributes

Format an attributes object into a string suitable for the 9th column of GFF3.

#### Parameters

- `attrs` **[GFF3Attributes](#gff3attributes)** Attributes

Returns **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** GFF3 9th column string

### formatFeature

Format a feature object or array of feature objects into one or more lines of
GFF3.

#### Parameters

- `featureOrFeatures` **([GFF3FeatureLine](#gff3featureline) | [GFF3FeatureLineWithRefs](#gff3featurelinewithrefs) | [Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)<([GFF3FeatureLine](#gff3featureline) | [GFF3FeatureLineWithRefs](#gff3featurelinewithrefs))>)** A feature object or array of feature objects

Returns **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** A string of one or more GFF3 lines

### formatDirective

Format a directive into a line of GFF3.

#### Parameters

- `directive` **GFF3Directive** A directive object

Returns **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** A directive line string

### formatComment

Format a comment into a GFF3 comment.
Yes I know this is just adding a # and a newline.

#### Parameters

- `comment` **[GFF3Comment](#gff3comment)** A comment object

Returns **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** A comment line string

### formatSequence

Format a sequence object as FASTA

#### Parameters

- `seq` **[GFF3Sequence](#gff3sequence)** A sequence object

Returns **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** Formatted single FASTA sequence string

### formatItem

Format a directive, comment, sequence, or feature, or array of such items,
into one or more lines of GFF3.

#### Parameters

- `item` **([GFF3FeatureLineWithRefs](#gff3featurelinewithrefs) | GFF3Directive | [GFF3Comment](#gff3comment) | [GFF3Sequence](#gff3sequence))**&#x20;
- `itemOrItems` A comment, sequence, or feature, or array of such items

Returns **[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)** A formatted string or array of strings

### GFF3Attributes

A record of GFF3 attribute identifiers and the values of those identifiers

Type: Record<[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String), [Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)<[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)>>

### GFF3FeatureLine

A representation of a single line of a GFF3 file

#### seq_id

The ID of the landmark used to establish the coordinate system for the current feature

Type: ([string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) | null)

#### source

A free text qualifier intended to describe the algorithm or operating procedure that generated this feature

Type: ([string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) | null)

#### type

The type of the feature

Type: ([string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) | null)

#### start

The start coordinates of the feature

Type: ([number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) | null)

#### end

The end coordinates of the feature

Type: ([number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) | null)

#### score

The score of the feature

Type: ([number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number) | null)

#### strand

The strand of the feature

Type: ([string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) | null)

#### phase

For features of type "CDS", the phase indicates where the next codon begins relative to the 5' end of the current CDS feature

Type: ([string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String) | null)

#### attributes

Feature attributes

Type: ([GFF3Attributes](#gff3attributes) | null)

### GFF3FeatureLineWithRefs

**Extends GFF3FeatureLine**

A GFF3 Feature line that includes references to other features defined in
their "Parent" or "Derives_from" attributes

#### child_features

An array of child features

Type: [Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)<[GFF3Feature](#gff3feature)>

#### derived_features

An array of features derived from this feature

Type: [Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)<[GFF3Feature](#gff3feature)>

### GFF3Feature

A GFF3 feature, which may include multiple individual feature lines

Type: [Array](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Array)<[GFF3FeatureLineWithRefs](#gff3featurelinewithrefs)>

### BaseGFF3Directive

A GFF3 directive

#### directive

The name of the directive

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

#### value

The string value of the directive

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

### GFF3SequenceRegionDirective

**Extends BaseGFF3Directive**

A GFF3 sequence-region directive

#### value

The string value of the directive

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

#### seq_id

The sequence ID parsed from the directive

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

#### start

The sequence start parsed from the directive

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

#### end

The sequence end parsed from the directive

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

### GFF3GenomeBuildDirective

**Extends BaseGFF3Directive**

A GFF3 genome-build directive

#### value

The string value of the directive

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

#### source

The genome build source parsed from the directive

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

#### buildName

The genome build name parsed from the directive

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

### GFF3Comment

A GFF3 comment

#### comment

The text of the comment

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

### GFF3Sequence

A GFF3 FASTA single sequence

#### id

The ID of the sequence

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

#### description

The description of the sequence

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

#### sequence

The sequence

Type: [string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)

## License

MIT © [Robert Buels](https://github.com/rbuels)
