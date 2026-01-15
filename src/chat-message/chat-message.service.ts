import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { WhatsappService } from "src/whatsapp/whatsapp.service";
import { CreateChatMessageDto } from "./dto/create-chat-message.dto";
import { SimpleStatus } from "@prisma/client";
import  { ChatGateway } from "src/chat/chat.gateway";

@Injectable()
export class ChatMessageService {
  private readonly logger = new Logger(ChatMessageService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
    private gateway: ChatGateway,
  ) { }

  async create(dto: CreateChatMessageDto) {
    let mentionedProfessionalId = dto.mentionedProfessionalId;

    // 1. Processamento de Menção (Lógica de Negócio)
    if (!mentionedProfessionalId) {
        const mention = this.extractMention(dto.message);
        if (mention) {
            const user = await this.prisma.user.findFirst({
                where: { 
                    name: { contains: mention.name, mode: 'insensitive' },
                    status: SimpleStatus.ACTIVE 
                },
                select: { id: true, name: true }
            });
            
            if (user) {
                mentionedProfessionalId = user.id;
                // Opcional: Normalizar o texto para @NomeCorreto
                dto.message = dto.message.replace(mention.full, `@${user.name}`);
            }
        }
    }

    // 2. Persistência (Atomicidade)
    const message = await this.prisma.chatMessage.create({
      data: {
        chatId: dto.chatId,
        senderId: dto.senderId,
        message: dto.message,
        mentionedProfessionalId,
      },
      include: {
        sender: { select: { id: true, name: true, role: true, professionalRole: true } },
        mentionedProfessional: { select: { id: true, name: true, contact: true } }
      }
    });

    // 3. Notificações (Assíncronas / Resiliência)
    this.handleNotifications(message, dto.chatId);

    return message;
  }

  private async handleNotifications(message: any, chatId: string) {
    // A. WebSocket (Real-time) - Prioridade Alta
    this.gateway.notifyChat(chatId, 'chat:message', message);

    // B. Notificações Push / WhatsApp (Background) - Prioridade Média
    if (message.mentionedProfessional) {
        // Notifica via Socket pessoal
        this.gateway.notifyUser(message.mentionedProfessional.id, 'notification:mention', {
            title: 'Você foi mencionado',
            message: message.message,
            chatId,
            sender: message.sender.name
        });

        // Notifica via WhatsApp (Circuit Breaker implícito com try/catch)
        if (message.mentionedProfessional.phone) {
            try {
                await this.whatsapp.sendTextMessage(
                    message.mentionedProfessional.phone,
                    `🔔 *${message.sender.name}* mencionou você:\n\n"${message.message}"`
                );
            } catch (error) {
                this.logger.warn(`Falha ao enviar WhatsApp para ${message.mentionedProfessional.name}: ${error.message}`);
                // Não relança o erro para não quebrar o fluxo
            }
        }
    }
  }

  // Helper Regex Otimizado
  private extractMention(text: string) {
    const match = text.match(/@([a-zA-ZÀ-ÿ\s]+)(?=\s|$)/);
    return match ? { full: match[0], name: match[1].trim() } : null;
  }

  // ... mantenha o findByChat e outros métodos de leitura
  async findByChat(chatId: string) {
      return this.prisma.chatMessage.findMany({
          where: { chatId },
          include: {
              sender: { select: { id: true, name: true, professionalRole: true, role: true } },
              mentionedProfessional: { select: { id: true, name: true } }
          },
          orderBy: { createdAt: 'asc' }
      });
  }
}