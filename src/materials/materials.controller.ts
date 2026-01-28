/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { RolesGuard } from 'src/auth/roles.guard';
import { TenantInterceptor } from 'src/common/interceptors/tenant.interceptor'; // Importe seu interceptor
import { CreateMaterialDto, PaginationDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { MaterialsService } from './materials.service';

@ApiTags('Materials')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard) // 🔥 Segurança
@UseInterceptors(TenantInterceptor)  // 🔥 Contexto CLS (Tenant)
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar novo material' })
  @ApiResponse({ status: 201, description: 'Material criado.' })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createMaterialDto: CreateMaterialDto) {
    return this.materialsService.create(createMaterialDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar materiais (Paginado)' })
  async findAll(@Query() pagination: PaginationDto) {
    // 🔥 Agora segue o padrão do CompaniesController usando DTO
    return this.materialsService.findAll(pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar material por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar material' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateMaterialDto: UpdateMaterialDto,
  ) {
    return this.materialsService.update(id, updateMaterialDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Inativar material (Soft Delete)' })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.materialsService.remove(id);
  }
}