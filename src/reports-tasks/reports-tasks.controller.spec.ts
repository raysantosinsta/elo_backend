import { Test, TestingModule } from '@nestjs/testing';
import { ReportsTasksController } from './reports-tasks.controller';
import { ReportsTasksService } from './reports-tasks.service';

describe('ReportsTasksController', () => {
  let controller: ReportsTasksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsTasksController],
      providers: [ReportsTasksService],
    }).compile();

    controller = module.get<ReportsTasksController>(ReportsTasksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
