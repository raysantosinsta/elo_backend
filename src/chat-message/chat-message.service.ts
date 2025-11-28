/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from "@nestjs/common";
import { ChatGateway } from "src/chat/chat.gateway";
import { PrismaService } from "src/prisma/prisma.service";
import { WhatsappService } from "src/whatsapp/whatsapp.service";
import { CreateChatMessageDto } from "./dto/create-chat-message.dto";
import { ChatMessageResponseDto } from "./dto/chat-message-response.dto";
import { UserStatus } from "@prisma/client";

@Injectable()
export class ChatMessageService {
  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
    private gateway: ChatGateway,
  ) { }

  async create(dto: CreateChatMessageDto): Promise<ChatMessageResponseDto> {
    let mentionedProfessionalId: string | undefined;
    let mentionToReplace: string | undefined;

    // Extrair e processar menções
    const mention = this.extractMention(dto.message);
    if (mention) {
      console.log(`🔍 Menção detectada na mensagem: @${mention.mentionedName}`);

      // Buscar usuário pelo nome mencionado
      const mentionedUser = await this.prisma.user.findFirst({
        where: {
          name: { equals: mention.mentionedName, mode: 'insensitive' },
          isProfessional: true,
          status: UserStatus.ATIVO, // 🔥 IMPORTANTE: Só usuários ativos
        },
      });

      if (mentionedUser) {
        console.log(`✅ Usuário mencionado encontrado: ${mentionedUser.name} (ID: ${mentionedUser.id})`);
        mentionedProfessionalId = mentionedUser.id;
        mentionToReplace = mention.fullMention;

        // Substituir @Nome por @Nome no texto para manter a formatação
        if (mentionToReplace) {
          dto.message = dto.message.replace(mentionToReplace, `@${mentionedUser.name}`);
        }

        // Enviar notificação via WhatsApp se o usuário tiver telefone
        if (mentionedUser.phone) {
          const sender = await this.prisma.user.findUnique({
            where: { id: dto.senderId },
          });

          if (sender) {
            try {
              await this.whatsapp.sendTextMessage(
                mentionedUser.phone,
                `📩 Você foi mencionado por ${sender.name}:\n\n"${dto.message}"\n\nChat: ${dto.chatId}`
              );
              console.log(`✅ WhatsApp enviado com sucesso para ${mentionedUser.phone}`);
            } catch (error) {
              console.error(`❌ Falha ao enviar WhatsApp para ${mentionedUser.phone}:`, error.response?.data || error.message);
            }
          } else {
            console.log(`❌ Sender não encontrado para notificação WhatsApp: ${dto.senderId}`);
          }
        } else {
          console.log(`⚠️ Usuário mencionado sem telefone: ${mentionedUser.name}`);
        }
      } else {
        console.log(`❌ Nenhum usuário profissional encontrado para menção: @${mention.mentionedName}`);
      }
    } else {
      console.log(`📝 Nenhuma menção detectada na mensagem: "${dto.message}"`);
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

    // Log final para confirmar o resultado da menção
    if (mentionedProfessionalId) {
      console.log(`🎉 Menção processada com sucesso! ID do mencionado: ${mentionedProfessionalId}`);
    } else {
      console.log(`📭 Mensagem criada sem menção processada.`);
    }

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
        try {
          if (prof.phone) {
            await this.whatsapp.sendTextMessage(
              prof.phone,
              `📩 Você foi mencionado por ${created.sender.name}:\n\n"${dto.message}"`
            );
          }
        } catch (error) {
          console.error('❌ Falha ao enviar notificação via WhatsApp para menção DTO:', error);
          if (error.response?.status === 401) {
            console.error('➡️ Causa provável: WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não estão configurados corretamente no ambiente.');
          }
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

  private extractMention(message: string): { mentionedName: string; fullMention: string } | null {
    // Regex corrigida: captura @ seguido por um ou mais caracteres de nome (incluindo espaços),
    // garantindo que não termine com espaço.
    // O `*?` torna o quantificador "não guloso" (non-greedy), fazendo com que ele pare na primeira correspondência válida.
    // Isso evita que ele capture palavras extras após o nome, como em "@Joao cobrar".
    const mentionRegex = /@([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s]*?[a-zA-ZÀ-ÿ]|[a-zA-ZÀ-ÿ]+)(?=\s|$|[,.;:!?])/g;
    const matches = [...message.matchAll(mentionRegex)];

    if (!matches || matches.length === 0) {
      return null;
    }

    // Usar a última menção (mais recente)
    const lastMatch = matches[matches.length - 1];
    const fullMention = lastMatch[0];
    const mentionedName = lastMatch[1].trim();

    console.log(`🔍 Menção detectada: "${fullMention}" → Nome: "${mentionedName}"`);

    return { mentionedName, fullMention };
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