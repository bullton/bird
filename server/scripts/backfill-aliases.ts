/**
 * 为所有已有物种生成中文别名（从 chineseName 提取）
 * 运行一次即可
 */
import { db, schema } from '../src/db/client.js';

const species = db.select({ id: schema.species.id, chineseName: schema.species.chineseName })
  .from(schema.species)
  .all();

console.log(`Found ${species.length} species`);

for (const sp of species) {
  if (!sp.chineseName) continue;
  // 支持 "长冠八哥 / 罗斯柴尔德八哥" 这样的多名称
  const names = sp.chineseName.split(/[\\/]/).map((n: string) => n.trim()).filter(Boolean);
  for (const name of names) {
    try {
      db.insert(schema.speciesAliases).values({
        speciesId: sp.id,
        aliasName: name,
        language: 'zh',
      }).run();
      console.log(`  Added alias "${name}" for species ${sp.id}`);
    } catch {
      // 忽略唯一约束冲突
    }
  }
}

console.log('Done');
