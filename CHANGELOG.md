# v2.1.0

- Add ability to specify custom `errorCallback` to stream parser. By default the
  stream closes when an error is encountered, but a custom `errorCallback` can
  be used to e.g. skip failed features instead of stopping the stream.

# v2.0.0

- Parsing and formatting of streams has been converted from Node.js streams to
  web streams
  - `parseStream` and `formatStream` were removed
  - `GFFTransformer` and `GFFFormattingTransformer` were added
- `parseAll` and `encoding` options of the parser have been removed
- `bufferSize` option of the parser now defaults to `Infinity`


# v1.3.0

- Added stream-browserify polyfill
