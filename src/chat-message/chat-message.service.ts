/* eslint-disable prettier/prettier */
import { Injectable } from "@nestjs/common";
import { ChatGateway } from "src/chat/chat.gateway";
import { PrismaService } from "src/prisma/prisma.service";
import { WhatsappService } from "src/whatsapp/whatsapp.service";
import { CreateChatMessageDto } from "./dto/create-chat-message.dto";
import { ChatMessageResponseDto } from "./dto/chat-message-response.dto";

@Injectable()
export class ChatMessageService {
  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
    private gateway: ChatGateway,
  ) { }

  async create(dto: CreateChatMessageDto): Promise<ChatMessageResponseDto> {
    let mentionedProfessionalId: string | undefined;
    
    // Extrair e processar menções
    const mention = this.extractMention(dto.message);
    if (mention) {
      // Buscar usuário pelo nome mencionado
      const mentionedUser = await this.prisma.user.findFirst({
        where: {
          name: { contains: mention.mentionedName, mode: 'insensitive' },
          isProfessional: true,
        },
      });

      if (mentionedUser) {
        mentionedProfessionalId = mentionedUser.id;

        // Enviar notificação via WhatsApp se o usuário tiver telefone
        if (mentionedUser.phone) {
          const sender = await this.prisma.user.findUnique({
            where: { id: dto.senderId },
          });

          if (sender) {
            await this.whatsapp.sendTextMessage(
              mentionedUser.phone,
              `📩 Você foi mencionado por ${sender.name}:\n\n"${dto.message}"\n\nChat: ${dto.chatId}`
            ).catch(error => {
              console.error('Erro ao enviar WhatsApp:', error);
            });
          }
        }
      }
    }

    // Criar a mensagem no banco de dados
    const created = await this.prisma.chatMessage.create({
      data: {
        ...dto,
        mentionedProfessionalId,
      },
      include: {
        sender: {
          select: {
            id: true,
            createdAt: true,
            name: true,
            status: true,
            email: true,
            role: true,
            isProfessional: true,
            professionalRole: true,
            phone: true,
            updatedAt: true,
            companyId: true,
          },
        },
        mentionedProfessional: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            professionalRole: true,
          },
        },
      },
    });

    // Transformar null para undefined para campos que esperam string | undefined no DTO
    const transformedSender = {
      ...created.sender,
      professionalRole: created.sender.professionalRole ?? undefined,
      companyId: created.sender.companyId ?? undefined,
    };

    const transformedMentionedProfessional = created.mentionedProfessional ? {
      ...created.mentionedProfessional,
      professionalRole: created.mentionedProfessional.professionalRole ?? undefined,
    } : undefined;

    const createdForDto = {
      ...created,
      chatId: created.chatId ?? undefined,
      mentionedProfessionalId: created.mentionedProfessionalId ?? undefined,
      sender: transformedSender,
      mentionedProfessional: transformedMentionedProfessional,
    };

    const response = new ChatMessageResponseDto(createdForDto);

    // NOTIFICAÇÕES EM TEMPO REAL

    // 1. Notificar todos no chat sobre a nova mensagem (se houver chatId)
    if (dto.chatId) {
      this.gateway.notifyChat(dto.chatId, 'chat:message', response);
    }

    // 2. Notificar a empresa se o sender pertencer a uma
    if (created.sender.companyId) {
      this.gateway.notifyCompany(
        created.sender.companyId,
        'chat:message',
        response,
      );
    }

    // 3. Notificar o usuário mencionado (se foi mencionado via DTO)
    if (dto.mentionedProfessionalId) {
      const prof = await this.prisma.user.findUnique({
        where: { id: dto.mentionedProfessionalId },
        select: {
          id: true,
          phone: true,
          name: true,
        },
      });

      if (prof) {
        // Enviar WhatsApp para menção via DTO
        if (prof.phone) {
          await this.whatsapp.sendTextMessage(
            prof.phone,
            `📩 Você foi mencionado por ${created.sender.name}:\n\n"${dto.message}"`
          ).catch(error => {
            console.error('Erro ao enviar WhatsApp para menção DTO:', error);
          });
        }

        // Notificar via WebSocket
        this.gateway.notifyUser(prof.id, 'notification:mention', {
          type: 'mention',
          title: 'Você foi mencionado!',
          message: dto.message,
          chatId: dto.chatId,
          mentionedBy: created.sender.name,
          mentionedByUserId: dto.senderId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // 4. Notificar o usuário mencionado (se foi mencionado via @ no texto)
    if (mentionedProfessionalId && mentionedProfessionalId !== dto.mentionedProfessionalId) {
      const mentionedUser = await this.prisma.user.findUnique({
        where: { id: mentionedProfessionalId },
        select: {
          id: true,
          name: true,
          phone: true,
        },
      });

      if (mentionedUser) {
        // Notificar via WebSocket
        this.gateway.notifyUser(mentionedUser.id, 'notification:mention', {
          type: 'mention',
          title: 'Você foi mencionado!',
          message: dto.message,
          chatId: dto.chatId,
          mentionedBy: created.sender.name,
          mentionedByUserId: dto.senderId,
          timestamp: new Date().toISOString(),
          fromTextMention: true, // Flag para identificar que veio do @ no texto
        });

        // WhatsApp já foi enviado acima no processamento da menção
      }
    }

    // 5. Notificação geral para o sender (confirmação de envio)
    this.gateway.notifyUser(dto.senderId, 'notification:message_sent', {
      type: 'message_sent',
      title: 'Mensagem enviada!',
      message: dto.message,
      chatId: dto.chatId,
      timestamp: new Date().toISOString(),
    });

    return response;
  }

  async findByChat(chatId: string): Promise<ChatMessageResponseDto[]> {
    // Buscar mensagens do chat
    const messages = await this.prisma.chatMessage.findMany({
      where: { chatId },
      include: {
        sender: {
          select: {
            id: true,
            createdAt: true,
            name: true,
            status: true,
            email: true,
            role: true,
            isProfessional: true,
            professionalRole: true,
            phone: true,
            updatedAt: true,
            companyId: true,
          },
        },
        mentionedProfessional: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            professionalRole: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' }, // Ordem cronológica
    });

    // Transformar cada mensagem para corresponder às expectativas do DTO (null -> undefined)
    const transformedMessages = messages.map((message) => {
      const transformedSender = {
        ...message.sender,
        professionalRole: message.sender.professionalRole ?? undefined,
        companyId: message.sender.companyId ?? undefined,
      };

      const transformedMentionedProfessional = message.mentionedProfessional ? {
        ...message.mentionedProfessional,
        professionalRole: message.mentionedProfessional.professionalRole ?? undefined,
      } : undefined;

      const transformedMessage = {
        ...message,
        chatId: message.chatId ?? undefined,
        mentionedProfessionalId: message.mentionedProfessionalId ?? undefined,
        sender: transformedSender,
        mentionedProfessional: transformedMentionedProfessional,
      };

      return new ChatMessageResponseDto(transformedMessage);
    });

    return transformedMessages;
  }

  // Método para extrair menções do texto
  private extractMention(message: string): { mentionedName: string } | null {
    const mentionRegex = /@([^@\s]+)/g;
    const matches = message.match(mentionRegex);

    if (!matches || matches.length === 0) {
      return null;
    }

    // Pegar a primeira menção (pode expandir para múltiplas menções futuramente)
    const mention = matches[0];
    const mentionedName = mention.substring(1); // Remover o @

    return { mentionedName };
  }

  // Método adicional: buscar mensagens com menções para um usuário
  async findMentionsForUser(userId: string): Promise<ChatMessageResponseDto[]> {
    const messages = await this.prisma.chatMessage.findMany({
      where: { 
        OR: [
          { mentionedProfessionalId: userId },
          { 
            message: {
              contains: `@`, // Busca por mensagens que contenham @
            }
          }
        ]
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            isProfessional: true,
            professionalRole: true,
          },
        },
        mentionedProfessional: {
          select: {
            id: true,
            name: true,
            email: true,
            professionalRole: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // Limitar resultados
    });

    // Filtrar mensagens onde o usuário foi realmente mencionado pelo nome
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true }
    });

    const filteredMessages = messages.filter(message => {
      // Se tem mentionedProfessionalId, já está claro
      if (message.mentionedProfessionalId === userId) return true;
      
      // Se não tem, verificar se o nome do usuário está mencionado no texto
      if (user && message.message.includes(`@${user.name}`)) {
        return true;
      }

      return false;
    });

    return filteredMessages.map(message => {
      const transformedSender = {
        ...message.sender,
        professionalRole: message.sender.professionalRole ?? undefined,
      };

      const transformedMentionedProfessional = message.mentionedProfessional ? {
        ...message.mentionedProfessional,
        professionalRole: message.mentionedProfessional.professionalRole ?? undefined,
      } : undefined;

      const transformedMessage = {
        ...message,
        chatId: message.chatId ?? undefined,
        mentionedProfessionalId: message.mentionedProfessionalId ?? undefined,
        sender: transformedSender,
        mentionedProfessional: transformedMentionedProfessional,
      };

      return new ChatMessageResponseDto(transformedMessage);
    });
  }
}