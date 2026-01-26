/* eslint-disable prettier/prettier */
import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Patch, 
  Param, 
  Delete, 
  Query, 
  ParseUUIDPipe, 
  DefaultValuePipe, 
  ParseIntPipe 
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('Produtos')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Criar um novo produto' })
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar produtos da empresa' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll(page, limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar detalhes de um produto' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar produto' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Arquivar (Deletar logicamente) produto' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id);
  }

  // --- Endpoints de Materiais Vinculados ---

  @Post(':id/materials')
  @ApiOperation({ summary: 'Adicionar ou atualizar material ao produto' })
  addMaterial(
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() body: { materialId: string; quantidade: number },
  ) {
    return this.productsService.addMaterial(productId, body.materialId, body.quantidade);
  }

  @Delete(':id/materials/:materialId')
  @ApiOperation({ summary: 'Remover material do produto' })
  removeMaterial(
    @Param('id', ParseUUIDPipe) productId: string,
    @Param('materialId', ParseUUIDPipe) materialId: string,
  ) {
    return this.productsService.removeMaterial(productId, materialId);
  }
}