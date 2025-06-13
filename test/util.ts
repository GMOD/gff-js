import fs from 'fs'
import type { UnderlyingSink } from 'stream/web'

export class SyncFileSink implements UnderlyingSink<string> {
  constructor(private fileDescriptor: number) {}

  write(chunk: string) {
    fs.appendFileSync(this.fileDescriptor, chunk)
  }
}
