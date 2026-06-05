import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('should return API health with integration marker', () => {
      expect(appController.healthCheck()).toMatchObject({
        status: 'ok',
        service: 'ELO API',
        integration: 'frontend-backend',
      });
    });
  });
});
