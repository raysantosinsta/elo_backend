import { Test, TestingModule } from '@nestjs/testing';
import { ReportsFlowController } from './reports-flow.controller';
import { ReportsFlowService } from './reports-flow.service';

describe('ReportsFlowController', () => {
  let controller: ReportsFlowController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsFlowController],
      providers: [ReportsFlowService],
    }).compile();

    controller = module.get<ReportsFlowController>(ReportsFlowController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
