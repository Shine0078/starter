import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';

import { CurrentUser } from '../auth/auth.guard';
import { AttachReceiptDto, ScanReceiptDto } from './receipts.dto';
import { ReceiptsService } from './receipts.service';

@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  /** Recognise pasted/OCR'd receipt text without storing it. */
  @Post('scan')
  async scan(@Body() body: ScanReceiptDto) {
    return {
      provider: this.receipts.providerConfigured ? 'local' : 'unconfigured',
      scan: await this.receipts.scan(body.text),
    };
  }

  /** Attach a parsed receipt to one of the user's transactions. */
  @Put(':transactionId')
  async attach(
    @CurrentUser() userId: string,
    @Param('transactionId') transactionId: string,
    @Body() body: AttachReceiptDto,
  ) {
    return { receipt: await this.receipts.attach(userId, transactionId, body.text) };
  }

  @Get(':transactionId')
  async getForTransaction(
    @CurrentUser() userId: string,
    @Param('transactionId') transactionId: string,
  ) {
    return { receipt: await this.receipts.getForTransaction(userId, transactionId) };
  }
}
