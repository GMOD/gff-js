import fs from 'fs'
import type {
  UnderlyingByteSource,
  UnderlyingSink,
  ReadableByteStreamController,
} from 'stream/web'

// In Node 18 we can use `stream.Readable.toWeb()` instead of having to make our
// own file source
export class FileSource implements UnderlyingByteSource {
  type = 'bytes' as const
  autoAllocateChunkSize = 1024
  fileHandeP: Promise<fs.promises.FileHandle>

  constructor(filePath: string) {
    this.fileHandeP = fs.promises.open(filePath)
  }

  async pull(controller: ReadableByteStreamController) {
    // @ts-ignore
    const view = controller.byobRequest.view as ArrayBufferView
    const fileHandle = await this.fileHandeP
    const { bytesRead } = await fileHandle.read({
      buffer: view,
      offset: view.byteOffset,
      length: view.byteLength,
    })

    if (bytesRead === 0) {
      await fileHandle.close()
      controller.close()
    }

    // @ts-ignore
    controller.byobRequest.respond(bytesRead)
  }
}

export class SyncFileSink implements UnderlyingSink<string> {
  constructor(private fileDescriptor: number) {}

  write(chunk: string) {
    fs.appendFileSync(this.fileDescriptor, chunk)
  }
}
