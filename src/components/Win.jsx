/** Ventana estilo escritorio: barra de título con tres puntos y cuerpo libre. */
export default function Win({ title, className = '', bodyProps, children }) {
    return (
        <div className={`win ${className}`}>
            <div className="win-bar">
                <span className="win-title">{title}</span>
                <span className="win-dots" aria-hidden="true">
                    <i /><i /><i />
                </span>
            </div>
            <div className="win-body" {...bodyProps}>
                {children}
            </div>
        </div>
    );
}
