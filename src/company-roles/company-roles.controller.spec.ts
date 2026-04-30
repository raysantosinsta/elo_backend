import { Test, TestingModule } from '@nestjs/testing';
import { CompanyRolesController } from './company-roles.controller';
import { CompanyRolesService } from './company-roles.service';

describe('CompanyRolesController', () => {
  let controller: CompanyRolesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompanyRolesController],
      providers: [CompanyRolesService],
    }).compile();

    controller = module.get<CompanyRolesController>(CompanyRolesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
