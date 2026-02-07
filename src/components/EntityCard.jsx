import { Building2, User } from 'lucide-react'

/**
 * EntityCard Component - Reusable card with shaped borders and name-based color tints
 *
 * Used across Leads, Lead Setter, Pipeline, Quotes, Jobs, and Customers pages.
 *
 * - Business entities (truthy businessName) get a building-shaped border (squared corners)
 * - Personal entities get a person-shaped border (rounded top like head/shoulders)
 * - First name is matched against ~200 male/female names for a subtle color tint
 *
 * Usage:
 * <EntityCard name="John Smith" businessName="Acme Corp" onClick={() => {}}>
 *   <p>Card content here</p>
 * </EntityCard>
 */

const MALE_NAMES = new Set([
  'james','john','robert','michael','david','william','richard','joseph','thomas','charles',
  'christopher','daniel','matthew','anthony','mark','donald','steven','paul','andrew','joshua',
  'kenneth','kevin','brian','george','timothy','ronald','edward','jason','jeffrey','ryan',
  'jacob','gary','nicholas','eric','jonathan','stephen','larry','justin','scott','brandon',
  'benjamin','samuel','raymond','gregory','frank','alexander','patrick','jack','dennis','jerry',
  'tyler','aaron','jose','nathan','henry','peter','douglas','adam','zachary','walter',
  'kyle','harold','carl','arthur','gerald','roger','keith','jeremy','terry','lawrence',
  'sean','christian','austin','jesse','dylan','billy','bruce','albert','willie','gabriel',
  'eugene','logan','wayne','ralph','roy','russell','louis','philip','bobby','johnny',
  'bradley','howard','vincent','ethan','mason','caleb','connor','aiden','luke','owen',
  'liam','noah','elijah','oliver','carter','jayden','hunter','landon','cole','evan',
  'jordan','cameron','adrian','miles','leo','ian','miguel','angel','victor','tony',
  'derek','marcus','travis','troy','brett','chad','corey','craig','dale','darren',
  'darryl','dean','dominic','drew','dustin','edgar','eli','elliot','ernesto','felipe',
  'fernando','floyd','francis','fredrick','geoffrey','glen','gordon','grant','hector','herbert',
  'herman','hugo','isaac','ivan','jared','jay','joel','jorge','julian','karl',
  'lance','leon','leslie','levi','lloyd','lonnie','loren','luis','luther','mario',
  'marshall','marvin','max','melvin','milo','mitchell','morris','nate','neil','nelson',
  'noel','norman','oliver','omar','orlando','oscar','otto','parker','perry','preston',
  'rafael','ramon','randall','reed','rene','rex','riley','rocco','rodney','roland',
  'roman','ross','ruben','salvador','sergio','shane','shawn','sheldon','sidney','simon',
  'spencer','stuart','ted','terrence','todd','tommie','trent','trevor','tristan','tucker',
  'vance','vernon','wade','warren','wendell','wesley','weston','wyatt','xavier','zane'
])

const FEMALE_NAMES = new Set([
  'mary','patricia','jennifer','linda','barbara','elizabeth','susan','jessica','sarah','karen',
  'lisa','nancy','betty','margaret','sandra','ashley','dorothy','kimberly','emily','donna',
  'michelle','carol','amanda','melissa','deborah','stephanie','rebecca','sharon','laura','cynthia',
  'kathleen','amy','angela','shirley','anna','brenda','pamela','emma','nicole','helen',
  'samantha','katherine','christine','debra','rachel','carolyn','janet','catherine','maria','heather',
  'diane','ruth','julie','olivia','joyce','virginia','victoria','kelly','lauren','christina',
  'joan','evelyn','judith','megan','andrea','cheryl','hannah','jacqueline','martha','gloria',
  'teresa','ann','sara','madison','frances','kathryn','janice','jean','abigail','alice',
  'julia','judy','sophia','grace','denise','amber','doris','marilyn','danielle','beverly',
  'isabella','theresa','diana','natalie','brittany','charlotte','marie','kayla','alexis','lori',
  'tammy','tiffany','crystal','rosa','bonnie','sylvia','elaine','dawn','wendy','yvonne',
  'lorraine','gail','tina','audrey','roxanne','lucille','carmen','naomi','penny','priscilla',
  'regina','renee','rita','robin','sonia','stacy','stella','tara','tracey','trudy',
  'vanessa','vera','veronica','vivian','wanda','wilma','yolanda','adriana','aimee','alicia',
  'allison','alyssa','anastasia','ariana','autumn','bailey','bianca','brooke','camille','candice',
  'carla','cassandra','cecilia','celeste','chantal','chloe','claire','colleen','constance','daisy',
  'darlene','desiree','elena','elisa','elsie','erica','erin','esther','eva','faith',
  'felicia','fiona','gabrielle','gina','gretchen','haley','harmony','hailey','hope','irene',
  'iris','ivy','jade','janelle','jasmine','jenna','joann','jocelyn','jolene','josie',
  'kara','katrina','kendra','kristen','krystal','lacey','lana','leah','lena','leslie',
  'leticia','liliana','lily','lorena','lucia','lydia','mabel','mackenzie','marcia','margo',
  'miriam','molly','monique','nadia','natasha','noelle','nora','paige','pearl','piper',
  'raquel','rebekah','rosemary','ruby','sabrina','savannah','selena','serena','shelby','sierra',
  'simone','skye','sonya','tabitha','tatiana','taylor','valerie','violet','virginia','zoey'
])

function getGenderTint(name) {
  if (!name) return null
  const firstName = name.trim().split(/\s+/)[0].toLowerCase()
  if (MALE_NAMES.has(firstName)) return 'rgba(59, 130, 246, 0.08)'
  if (FEMALE_NAMES.has(firstName)) return 'rgba(236, 72, 153, 0.08)'
  return null
}

const theme = {
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textMuted: '#7d8a7f'
}

export default function EntityCard({
  name,
  businessName,
  children,
  onClick,
  style
}) {
  const isBusiness = !!businessName
  const tint = getGenderTint(name)

  const cardStyle = {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: tint || theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: isBusiness ? '3px' : '20px 20px 10px 10px',
    padding: '16px',
    cursor: onClick ? 'pointer' : 'default',
    transition: 'box-shadow 0.15s ease, transform 0.15s ease',
    ...(onClick && {
      ':hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }
    }),
    ...style
  }

  const watermarkStyle = {
    position: 'absolute',
    top: isBusiness ? '8px' : '6px',
    right: isBusiness ? '8px' : '8px',
    opacity: 0.04,
    pointerEvents: 'none',
    zIndex: 0
  }

  const contentStyle = {
    position: 'relative',
    zIndex: 1
  }

  return (
    <div
      style={cardStyle}
      onClick={onClick}
      onMouseEnter={onClick ? (e) => {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      } : undefined}
      onMouseLeave={onClick ? (e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'none'
      } : undefined}
    >
      {/* Watermark icon */}
      {isBusiness ? (
        <Building2 size={64} style={watermarkStyle} color={theme.text} />
      ) : (
        <User size={64} style={watermarkStyle} color={theme.text} />
      )}

      {/* Card content */}
      <div style={contentStyle}>
        {children}
      </div>
    </div>
  )
}

export { getGenderTint, MALE_NAMES, FEMALE_NAMES }
