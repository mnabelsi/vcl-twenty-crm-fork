import { classifyJobTitle } from '@/people-tree/utils/classifyJobTitle';

describe('classifyJobTitle', () => {
  it.each([
    ['Chief Human Resources Officer', 'C-Suite'],
    ['CEO', 'C-Suite'],
    ['General Manager - Sales', 'C-Suite'],
    ['Senior Vice President of Technology', 'Digital'],
    ['Head - Talent, Learning and Organization Development', 'L&D'],
    ['Group Senior Manager - Functional Learning and Development', 'L&D'],
    ['Human Resources Director', 'HR'],
    ['Talent Acquisition Lead', 'HR'],
    ['Data Operations Manager', 'Digital'],
    ['IT Manager', 'Digital'],
    ['Business Development Manager', 'Other'],
    ['Strategic Sourcing Manager', 'Other'],
    ['  ', 'No title'],
    [null, 'No title'],
  ])('classifies %p as %p', (jobTitle, expectedPositionClass) => {
    expect(classifyJobTitle(jobTitle)).toBe(expectedPositionClass);
  });
});
