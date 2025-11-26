/* eslint-disable prettier/prettier */
import { Injectable } from "@nestjs/common";
import axios from "axios";

/* eslint-disable prettier/prettier */
@Injectable()
export class WhatsappService {
  private readonly token = process.env.WHATSAPP_TOKEN;
  private readonly phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  async sendTextMessage(phone: string, text: string) {
    const url = `https://graph.facebook.com/v17.0/${this.phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      to: phone.replace(/\D/g, ''),
      type: 'text',
      text: { body: text },
    };

    return axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });
  }
}
