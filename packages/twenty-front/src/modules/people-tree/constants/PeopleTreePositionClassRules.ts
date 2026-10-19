// Order matters: C-Suite wins over function, and L&D is checked before HR so "Talent, Learning and OD" lands in L&D.
export const PEOPLE_TREE_POSITION_CLASS_RULES: {
  positionClass: string;
  pattern: RegExp;
}[] = [
  {
    positionClass: 'C-Suite',
    pattern:
      /\b(ceo|cfo|coo|cto|cio|chro|cdo|cmo|cpo|cho|cxo|cso|cco|cao|cdto|chief|(?<!vice[ -])president|chairman|chairwoman|chairperson|managing director|general manager|founder|co-founder|owner|board member|executive director|secretary general|minister|governor)\b|\bgm\b|الرئيس التنفيذي|مدير عام|المدير العام|رئيس مجلس/i,
  },
  {
    positionClass: 'L&D',
    pattern:
      /learning|training|\bl\s?&\s?d\b|talent development|organi[sz]ation(al)? development|\bo\.?d\b|academy|capability|curriculum|instructional|leadership development|people development|التدريب|التطوير|التعلم/i,
  },
  {
    positionClass: 'HR',
    pattern:
      /\bhr\b|hrbp|human resources?|human capital|\bpeople\b|talent|recruit|acquisition|payroll|compensation|rewards?\b|employee|personnel|workforce|hris|الموارد البشرية|شؤون الموظفين/i,
  },
  {
    positionClass: 'Digital',
    pattern:
      /digital|\bit\b|information technology|technology|\btech\b|\bdata\b|\bai\b|artificial intelligence|innovation|transformation|software|systems|cyber|analytics|automation|\berp\b|infrastructure|developer|architect|الرقمي|التحول|تقنية|الذكاء/i,
  },
];
