import React from 'react';
import { Role, ROLES } from '../types/roles';
import '../styles/RoleCard.css';

interface RoleCardProps {
  role: Role;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
}

const RoleCard: React.FC<RoleCardProps> = ({ role, onClick, size = 'medium' }) => {
  return (
    <div
      className={`role-card role-card--${size} role-card--${role.team.toLowerCase()}`}
      onClick={onClick}
      style={{
        borderColor: role.borderColor,
        '--border-color': role.borderColor,
      } as React.CSSProperties & { '--border-color': string }}
    >
      {/* Card Background */}
      <div className="role-card__background">
        <div className="role-card__image-placeholder">
          <span className="role-card__image-icon">{role.icon}</span>
        </div>
      </div>

      {/* Card Content */}
      <div className="role-card__content">
        {/* Icon Badge */}
        <div className="role-card__icon-badge" style={{ borderColor: role.borderColor }}>
          <span className="role-card__icon">{role.icon}</span>
        </div>

        {/* Role Name Section */}
        <div className="role-card__name-section">
          <div className="role-card__banner" style={{ borderColor: role.borderColor }}>
            <h2 className="role-card__name-en">{role.nameEn.toUpperCase()}</h2>
          </div>
          <h3 className="role-card__name-ar">{role.nameAr}</h3>
        </div>

        {/* Description */}
        <p className="role-card__description">{role.descriptionAr}</p>

        {/* Team Badge */}
        <div className={`role-card__team-badge role-card__team-badge--${role.team.toLowerCase()}`}>
          <span className="role-card__team-label">
            {role.team === 'CITIZEN' && 'الفريق: المواطنون'}
            {role.team === 'MAFIA' && 'الفريق: المافيا'}
            {role.team === 'CULT' && 'الفريق: الطائفة'}
          </span>
        </div>

        {/* Abilities */}
        {size === 'large' && (
          <div className="role-card__abilities">
            <h4 className="role-card__abilities-title">المقدرات:</h4>
            <ul className="role-card__abilities-list">
              {role.abilities.map((ability, index) => (
                <li key={index} className="role-card__ability-item">
                  {ability}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Corner Decorations */}
      <div className="role-card__corner role-card__corner--top-left" style={{ borderColor: role.borderColor }}></div>
      <div className="role-card__corner role-card__corner--top-right" style={{ borderColor: role.borderColor }}></div>
      <div className="role-card__corner role-card__corner--bottom-left" style={{ borderColor: role.borderColor }}></div>
      <div className="role-card__corner role-card__corner--bottom-right" style={{ borderColor: role.borderColor }}></div>
    </div>
  );
};

export default RoleCard;

// Export all roles as cards grid
export const RoleCardsList: React.FC<{
  onClick?: (role: Role) => void;
  size?: 'small' | 'medium' | 'large';
  filter?: 'all' | 'CITIZEN' | 'MAFIA' | 'CULT';
}> = ({ onClick, size = 'medium', filter = 'all' }) => {
  const filteredRoles = Object.values(ROLES).filter(role => {
    if (filter === 'all') return true;
    return role.team === filter;
  });

  return (
    <div className="role-cards-grid">
      {filteredRoles.map(role => (
        <RoleCard key={role.id} role={role} onClick={() => onClick?.(role)} size={size} />
      ))}
    </div>
  );
};

// Export role by ID
export const RoleCardById: React.FC<{ roleId: string; size?: 'small' | 'medium' | 'large' }> = ({
  roleId,
  size = 'medium',
}) => {
  const role = ROLES[roleId as keyof typeof ROLES];
  if (!role) return <div>Role not found</div>;
  return <RoleCard role={role} size={size} />;
};
