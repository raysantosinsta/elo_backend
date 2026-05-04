import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappNotificationController } from './whatsapp-notification.controller';
import { WhatsappNotificationService } from './whatsapp-notification.service';

describe('WhatsappNotificationController', () => {
  let controller: WhatsappNotificationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappNotificationController],
      providers: [WhatsappNotificationService],
    }).compile();

    controller = module.get<WhatsappNotificationController>(WhatsappNotificationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
