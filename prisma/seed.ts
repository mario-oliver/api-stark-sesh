import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from '../src/generated/client.js'
import { buildSeedData } from '../src/services/seed/buildSeedData.js'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

function asJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
}

async function main() {
  const data = buildSeedData()

  // FK-safe order; every row is upserted by its fixed id so the seed is idempotent.
  await prisma.user.upsert({
    where: { id: data.user.id },
    create: data.user,
    update: { email: data.user.email, firstName: data.user.firstName, lastName: data.user.lastName }
  })

  {
    const { id, ...rest } = data.dog
    await prisma.dog.upsert({ where: { id }, create: data.dog, update: rest })
  }

  {
    const { id, ...rest } = data.dogMember
    await prisma.dogMember.upsert({ where: { id }, create: data.dogMember, update: rest })
  }

  {
    const { id, ...rest } = data.carePlan
    await prisma.carePlan.upsert({ where: { id }, create: data.carePlan, update: rest })
  }

  for (const action of data.careActions) {
    const { id, isMedication: _isMedication, ...rest } = action
    await prisma.careAction.upsert({ where: { id }, create: { id, ...rest }, update: rest })
  }

  {
    const { id, ...rest } = data.dailyCareLog
    await prisma.dailyCareLog.upsert({ where: { id }, create: data.dailyCareLog, update: rest })
  }

  for (const dca of data.dailyCareActions) {
    const { id, ...rest } = dca
    await prisma.dailyCareAction.upsert({ where: { id }, create: { id, ...rest }, update: rest })
  }

  {
    const { id, ...rest } = data.voiceNote
    await prisma.voiceNote.upsert({ where: { id }, create: data.voiceNote, update: rest })
  }

  for (const obs of data.healthObservations) {
    const { id, ...rest } = obs
    await prisma.healthObservation.upsert({ where: { id }, create: { id, ...rest }, update: rest })
  }

  for (const session of data.careAgentSessions) {
    const { id, messages, questions, draft, ...rest } = session
    const payload = {
      ...rest,
      messages: asJson(messages),
      questions: asJson(questions),
      draft: asJson(draft)
    }
    await prisma.careAgentSession.upsert({ where: { id }, create: { id, ...payload }, update: payload })
  }

  console.log('Seed complete (consolidated shape).')
  console.log(`  dog:              ${data.dog.name} (${data.dog.id})`)
  console.log(`  careActions:      ${data.careActions.length} across 3 buckets`)
  console.log(`  dailyCareActions: ${data.dailyCareActions.length} (incl. non-PLAN source)`)
  console.log(`  observations:     ${data.healthObservations.length}`)
  console.log(`  agent sessions:   ${data.careAgentSessions.map(s => s.kind).join(', ')}`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
