/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { 
  Injectable, 
  NotFoundException, 
  ForbiddenException 
} from '@nestjs/common';
import { CreateChatDto } from './dto/create-chat.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChatResponseDto } from './dto/chat-response.dto';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async create(createChatDto: CreateChatDto): Promise<ChatResponseDto> {
    const chat = await this.prisma.chat.create({
      data: createChatDto,
      include: { messages: true },
    });
    return new ChatResponseDto(chat);
  }

  async findOne(id: string, userCompanyId: string): Promise<ChatResponseDto> {
    const chat = await this.prisma.chat.findUnique({
      where: { id },
      include: { messages: true },
    });

    if (!chat || chat.companyId !== userCompanyId) {
      throw new NotFoundException('Chat não encontrado');
    }

    return new ChatResponseDto(chat);
  }

  async findAll(companyId: string): Promise<ChatResponseDto[]> {
    if (!companyId) {
      throw new Error('companyId é obrigatório para listar chats');
    }

    const chats = await this.prisma.chat.findMany({
      where: { companyId },
      include: { 
        messages: {
          include: {
            sender: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return chats.map(chat => new ChatResponseDto(chat));
  }

  // 🔥 NOVO MÉTODO: Deletar Chat com Segurança
  async remove(id: string, userCompanyId: string, userRole: string): Promise<void> {
    // 1. Validação de Cargo (RBAC)
    const allowedRoles = ['ADM', 'MASTER'];
    // Normalizamos para upperCase para evitar erros de case sensitivity
    if (!allowedRoles.includes(userRole?.toUpperCase())) {
      throw new ForbiddenException('Acesso negado: Apenas ADM ou MASTER podem deletar chats.');
    }

    // 2. Validação de Existência e Propriedade (Tenancy)
    // Buscamos apenas o companyId para ser performático
    const chat = await this.prisma.chat.findUnique({
      where: { id },
      select: { companyId: true }
    });

    if (!chat) {
        throw new NotFoundException('Chat não encontrado.');
    }

    if (chat.companyId !== userCompanyId) {
        // Por segurança, não dizemos que o chat existe em outra empresa, apenas 404
        throw new NotFoundException('Chat não encontrado.');
    }

    // 3. Execução da Deleção
    // O Prisma deletará as mensagens em cascata se o Schema estiver configurado com onDelete: Cascade
    // Caso contrário, pode ser necessário deletar as mensagens antes:
    // await this.prisma.message.deleteMany({ where: { chatId: id } }); 
    
    await this.prisma.chat.delete({
      where: { id },
    });
  }
}