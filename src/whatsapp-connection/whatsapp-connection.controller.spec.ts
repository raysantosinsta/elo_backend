import { Test, TestingModule } from '@nestjs/testing';
import { WhatsappConnectionController } from './whatsapp-connection.controller';
import { WhatsappConnectionService } from './whatsapp-connection.service';

describe('WhatsappConnectionController', () => {
  let controller: WhatsappConnectionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WhatsappConnectionController],
      providers: [WhatsappConnectionService],
    }).compile();

    controller = module.get<WhatsappConnectionController>(WhatsappConnectionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
