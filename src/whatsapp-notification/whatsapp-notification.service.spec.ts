import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappNotificationService } from './whatsapp-notification.service';

describe('WhatsappNotificationService', () => {
  let service: WhatsappNotificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsappNotificationService],
    }).compile();

    service = module.get<WhatsappNotificationService>(WhatsappNotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
