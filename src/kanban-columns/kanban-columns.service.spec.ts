import { Test, TestingModule } from '@nestjs/testing';
import { KanbanColumnsService } from './kanban-columns.service';

describe('KanbanColumnsService', () => {
  let service: KanbanColumnsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KanbanColumnsService],
    }).compile();

    service = module.get<KanbanColumnsService>(KanbanColumnsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
