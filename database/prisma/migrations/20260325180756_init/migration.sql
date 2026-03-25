-- CreateEnum
CREATE TYPE "ArticleType" AS ENUM ('PRODUIT_FINI', 'SEMI_FINI', 'ACHETE_COMMUN', 'ACHETE_SPECIFIQUE');

-- CreateEnum
CREATE TYPE "StatutOf" AS ENUM ('PLANIFIE', 'EN_COURS', 'TERMINE', 'EN_RETARD', 'ANNULE');

-- CreateEnum
CREATE TYPE "StatutAchat" AS ENUM ('COMMANDE', 'EN_TRANSIT', 'RECEPTIONNE', 'EN_RETARD', 'ANNULE');

-- CreateEnum
CREATE TYPE "TypeLien" AS ENUM ('FORT', 'PARTAGE', 'NOMENCLATURE');

-- CreateEnum
CREATE TYPE "Severite" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "article" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "ArticleType" NOT NULL,
    "delaiJours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "coutUnitaire" DOUBLE PRECISION,
    "unite" TEXT NOT NULL DEFAULT 'piece',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nomenclature" (
    "id" SERIAL NOT NULL,
    "parentArticleId" TEXT NOT NULL,
    "composantArticleId" TEXT NOT NULL,
    "quantite" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "optionnel" BOOLEAN NOT NULL DEFAULT false,
    "groupeOption" TEXT,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nomenclature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordre_fabrication" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "dateDebutPrevue" TIMESTAMP(3) NOT NULL,
    "dateFinPrevue" TIMESTAMP(3) NOT NULL,
    "statut" "StatutOf" NOT NULL DEFAULT 'PLANIFIE',
    "priorite" INTEGER NOT NULL DEFAULT 2,
    "parentOfId" TEXT,
    "clientNom" TEXT,
    "clientRef" TEXT,
    "config" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordre_fabrication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achat" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "quantiteRecue" INTEGER NOT NULL DEFAULT 0,
    "dateCommande" TIMESTAMP(3) NOT NULL,
    "dateLivraisonPrevue" TIMESTAMP(3) NOT NULL,
    "dateLivraisonReelle" TIMESTAMP(3),
    "fournisseur" TEXT NOT NULL,
    "statut" "StatutAchat" NOT NULL DEFAULT 'COMMANDE',
    "typeLien" TEXT NOT NULL,
    "ofSpecifiqueId" TEXT,
    "prixUnitaire" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "achat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependance" (
    "id" SERIAL NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "typeLien" "TypeLien" NOT NULL,
    "quantite" DOUBLE PRECISION,
    "delaiMinimum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dependance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_marge" (
    "id" SERIAL NOT NULL,
    "ofId" TEXT NOT NULL,
    "earlyStart" TIMESTAMP(3),
    "earlyFinish" TIMESTAMP(3),
    "lateStart" TIMESTAMP(3),
    "lateFinish" TIMESTAMP(3),
    "floatTotal" INTEGER NOT NULL DEFAULT 0,
    "floatLibre" INTEGER NOT NULL DEFAULT 0,
    "estCritique" BOOLEAN NOT NULL DEFAULT false,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cache_marge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cache_allocation" (
    "id" SERIAL NOT NULL,
    "achatId" TEXT NOT NULL,
    "ofId" TEXT NOT NULL,
    "quantiteAllouee" INTEGER NOT NULL,
    "rangPriorite" INTEGER NOT NULL,
    "couvert" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cache_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "userId" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "statut" TEXT NOT NULL DEFAULT 'brouillon',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerte" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "severite" "Severite" NOT NULL,
    "message" TEXT NOT NULL,
    "noeuds" JSONB NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nomenclature_parentArticleId_composantArticleId_version_key" ON "nomenclature"("parentArticleId", "composantArticleId", "version");

-- CreateIndex
CREATE INDEX "ordre_fabrication_statut_idx" ON "ordre_fabrication"("statut");

-- CreateIndex
CREATE INDEX "ordre_fabrication_dateDebutPrevue_dateFinPrevue_idx" ON "ordre_fabrication"("dateDebutPrevue", "dateFinPrevue");

-- CreateIndex
CREATE INDEX "ordre_fabrication_parentOfId_idx" ON "ordre_fabrication"("parentOfId");

-- CreateIndex
CREATE INDEX "achat_statut_idx" ON "achat"("statut");

-- CreateIndex
CREATE INDEX "achat_articleId_idx" ON "achat"("articleId");

-- CreateIndex
CREATE INDEX "achat_ofSpecifiqueId_idx" ON "achat"("ofSpecifiqueId");

-- CreateIndex
CREATE INDEX "dependance_sourceId_idx" ON "dependance"("sourceId");

-- CreateIndex
CREATE INDEX "dependance_targetId_idx" ON "dependance"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "dependance_sourceId_targetId_key" ON "dependance"("sourceId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "cache_marge_ofId_key" ON "cache_marge"("ofId");

-- CreateIndex
CREATE UNIQUE INDEX "cache_allocation_achatId_ofId_key" ON "cache_allocation"("achatId", "ofId");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- AddForeignKey
ALTER TABLE "nomenclature" ADD CONSTRAINT "nomenclature_parentArticleId_fkey" FOREIGN KEY ("parentArticleId") REFERENCES "article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomenclature" ADD CONSTRAINT "nomenclature_composantArticleId_fkey" FOREIGN KEY ("composantArticleId") REFERENCES "article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordre_fabrication" ADD CONSTRAINT "ordre_fabrication_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordre_fabrication" ADD CONSTRAINT "ordre_fabrication_parentOfId_fkey" FOREIGN KEY ("parentOfId") REFERENCES "ordre_fabrication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achat" ADD CONSTRAINT "achat_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achat" ADD CONSTRAINT "achat_ofSpecifiqueId_fkey" FOREIGN KEY ("ofSpecifiqueId") REFERENCES "ordre_fabrication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cache_marge" ADD CONSTRAINT "cache_marge_ofId_fkey" FOREIGN KEY ("ofId") REFERENCES "ordre_fabrication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cache_allocation" ADD CONSTRAINT "cache_allocation_achatId_fkey" FOREIGN KEY ("achatId") REFERENCES "achat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cache_allocation" ADD CONSTRAINT "cache_allocation_ofId_fkey" FOREIGN KEY ("ofId") REFERENCES "ordre_fabrication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
