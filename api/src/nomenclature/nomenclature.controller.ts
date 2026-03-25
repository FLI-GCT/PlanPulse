import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from 'src/_shared/adapters/prisma/prisma.service';
import { NomenclatureApi } from './_contract';

interface ExplodedNode {
  id: number;
  parentArticleId: string;
  composantArticleId: string;
  quantite: number;
  optionnel: boolean;
  groupeOption: string | null;
  version: string;
  niveau: number;
  quantiteCumulee: number;
}

@ApiTags('Nomenclature')
@Controller('nomenclature')
export class NomenclatureController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':articleId')
  @ApiOperation({ summary: 'Nomenclature directe d\'un article' })
  async getDirectBom(@Param('articleId') articleId: string) {
    const data = await this.prisma.nomenclature.findMany({
      where: { parentArticleId: articleId },
      include: {
        composant: true,
      },
    });

    return { data };
  }

  @Get(':articleId/explode')
  @ApiOperation({ summary: 'Nomenclature eclatee recursive (tous niveaux)' })
  async getExplodedBom(@Param('articleId') articleId: string) {
    const result: ExplodedNode[] = [];
    await this.explodeRecursive(articleId, 1, 1, result, new Set());
    return { data: result };
  }

  @Post()
  @ApiOperation({ summary: 'Creer un lien de nomenclature' })
  async create(@Body() body: NomenclatureApi.CreateRequest) {
    const nomenclature = await this.prisma.nomenclature.create({
      data: {
        parentArticleId: body.parentArticleId,
        composantArticleId: body.composantArticleId,
        quantite: body.quantite,
        optionnel: body.optionnel ?? false,
        groupeOption: body.groupeOption ?? null,
        version: body.version ?? 'v1',
      },
    });

    return nomenclature;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un lien de nomenclature' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    const existing = await this.prisma.nomenclature.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Nomenclature avec id ${id} introuvable`);
    }

    await this.prisma.nomenclature.delete({ where: { id } });
    return { message: `Nomenclature ${id} supprimee` };
  }

  private async explodeRecursive(
    parentArticleId: string,
    niveau: number,
    parentQuantite: number,
    result: ExplodedNode[],
    visited: Set<string>,
  ): Promise<void> {
    if (visited.has(parentArticleId)) {
      return; // Protection contre les cycles
    }
    visited.add(parentArticleId);

    const children = await this.prisma.nomenclature.findMany({
      where: { parentArticleId },
    });

    for (const child of children) {
      const quantiteCumulee = parentQuantite * child.quantite;

      result.push({
        id: child.id,
        parentArticleId: child.parentArticleId,
        composantArticleId: child.composantArticleId,
        quantite: child.quantite,
        optionnel: child.optionnel,
        groupeOption: child.groupeOption,
        version: child.version,
        niveau,
        quantiteCumulee,
      });

      await this.explodeRecursive(
        child.composantArticleId,
        niveau + 1,
        quantiteCumulee,
        result,
        new Set(visited),
      );
    }
  }
}
