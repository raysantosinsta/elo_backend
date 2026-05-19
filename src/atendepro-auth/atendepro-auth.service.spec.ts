import { Test, TestingModule } from '@nestjs/testing';
import { AtendeproAuthService } from './atendepro-auth.service';

describe('AtendeproAuthService', () => {
  let service: AtendeproAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AtendeproAuthService],
    }).compile();

    service = module.get<AtendeproAuthService>(AtendeproAuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
