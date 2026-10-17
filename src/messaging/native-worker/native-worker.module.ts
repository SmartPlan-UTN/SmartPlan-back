import { Global, Module } from '@nestjs/common';
import { NativeWorkerFactory } from './native-worker.factory';
import { NativeWorkerService } from './native-worker.service';

@Global()
@Module({
  providers: [NativeWorkerFactory, NativeWorkerService],
  exports: [NativeWorkerService, NativeWorkerFactory],
})
export class NativeWorkerModule {}
