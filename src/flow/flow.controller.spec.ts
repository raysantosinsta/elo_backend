import { Test, TestingModule } from '@nestjs/testing';
import { FlowController } from './flow.controller';
import { FlowService } from './flow.service';

describe('FlowController', () => {
  let controller: FlowController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FlowController],
      providers: [FlowService],
    }).compile();

    controller = module.get<FlowController>(FlowController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
