import { Test, TestingModule } from '@nestjs/testing';
import { ReportsFlowService } from './reports-flow.service';

describe('ReportsFlowService', () => {
  let service: ReportsFlowService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsFlowService],
    }).compile();

    service = module.get<ReportsFlowService>(ReportsFlowService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
