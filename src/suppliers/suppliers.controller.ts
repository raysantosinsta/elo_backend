/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { TenantInterceptor } from 'src/common/interceptors/tenant.interceptor'; // Ajuste o caminho se necessário
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('Suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)        // 1. Garante que está logado
@UseInterceptors(TenantInterceptor) // 2. Configura o contexto (tenantId, userId)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastra um novo fornecedor' })
  create(@Body() createSupplierDto: CreateSupplierDto) {
    // Não precisa passar ID, o service pega do contexto
    return this.suppliersService.create(createSupplierDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todos os fornecedores da empresa' })
  findAll() {
    // Removemos o @Query('companyId'). O service sabe quem é a empresa.
    return this.suppliersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca detalhes de um fornecedor' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza um fornecedor' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(id, updateSupplierDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove um fornecedor' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.remove(id);
  }
}