import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { ScenarioService } from './scenario.service';
import { scenarioActionSchema, ScenarioAction } from './_entities';

// ─── DTOs ──────────────────────────────────────────────────

const createScenarioSchema = z.object({
  nom: z.string().optional(),
});

class CreateScenarioDto extends createZodDto(createScenarioSchema) {}

// Le discriminatedUnion ne peut pas etre utilise directement avec createZodDto,
// on l'enveloppe dans un objet et on extrait l'action cote controller.
const applyActionWrapperSchema = z.object({
  type: z.string(),
}).passthrough();

class ApplyActionDto extends createZodDto(applyActionWrapperSchema) {}

// ─── Controller ─────────────────────────────────────────────

@ApiTags('Scenario')
@Controller('scenario')
export class ScenarioController {
  constructor(private readonly scenarioService: ScenarioService) {}

  @Post()
  @ApiOperation({ summary: 'Creer un scenario what-if a partir du graphe actuel' })
  async create(@Body() body: CreateScenarioDto) {
    return this.scenarioService.create(body.nom);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les scenarios' })
  async list() {
    return this.scenarioService.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail d\'un scenario avec son snapshot' })
  async getById(@Param('id') id: string) {
    return this.scenarioService.getById(id);
  }

  @Patch(':id/apply-action')
  @ApiOperation({ summary: 'Appliquer une action what-if au scenario' })
  async applyAction(@Param('id') id: string, @Body() body: ApplyActionDto) {
    // Validation Zod stricte du discriminatedUnion
    const action = scenarioActionSchema.parse(body) as ScenarioAction;
    return this.scenarioService.applyAction(id, action);
  }

  @Get(':id/kpi')
  @ApiOperation({ summary: 'Recuperer les KPI du scenario' })
  async getKpi(@Param('id') id: string) {
    return this.scenarioService.getKpi(id);
  }

  @Post(':id/commit')
  @ApiOperation({ summary: 'Valider et appliquer le scenario en production' })
  async commit(@Param('id') id: string) {
    await this.scenarioService.commit(id);
    return { message: `Scenario '${id}' valide et applique` };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Abandonner un scenario (soft delete)' })
  async delete(@Param('id') id: string) {
    await this.scenarioService.delete(id);
    return { message: `Scenario '${id}' abandonne` };
  }
}
