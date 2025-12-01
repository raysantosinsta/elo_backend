import { Test, TestingModule } from '@nestjs/testing';
import { NotificationUserGateway } from './notification-user.gateway';

describe('NotificationUserGateway', () => {
  let gateway: NotificationUserGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationUserGateway],
    }).compile();

    gateway = module.get<NotificationUserGateway>(NotificationUserGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
