import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappConnectionService } from './whatsapp-connection.service';

describe('WhatsappConnectionService', () => {
  let service: WhatsappConnectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappConnectionService],
    }).compile();

    service = module.get<WhatsappConnectionService>(WhatsappConnectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
