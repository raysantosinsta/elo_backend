import { Test, TestingModule } from '@nestjs/testing';
import { ReportsTasksService } from './reports-tasks.service';

describe('ReportsTasksService', () => {
  let service: ReportsTasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsTasksService],
    }).compile();

    service = module.get<ReportsTasksService>(ReportsTasksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
