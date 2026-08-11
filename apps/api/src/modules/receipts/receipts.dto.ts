import { IsString, Length } from 'class-validator';

const MAX_RECEIPT_TEXT = 8000;

export class ScanReceiptDto {
  @IsString()
  @Length(1, MAX_RECEIPT_TEXT)
  text!: string;
}

export class AttachReceiptDto {
  @IsString()
  @Length(1, MAX_RECEIPT_TEXT)
  text!: string;
}
